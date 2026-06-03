'use client';

/**
 * Beam Operations Context.
 *
 * - Starts beams immediately (no double-confirm)
 * - Tracks step history for vertical progress UI
 * - Persists to localStorage — loads incomplete beams on mount
 * - Dismiss removes from localStorage too
 */

import React, { createContext, useContext, useReducer, useCallback, useMemo, useEffect, useRef } from 'react';
import { BEAM_PHASE, isActivePhase } from '@/services/beam/core/types';
import { executeBeamOut } from '@/services/beam/processor/executor';
import { executeBeamBack } from '@/services/beam/processor/executor-beam-back';
import { executeEbtcBeam } from '@/services/beam/processor/executor-ebtc';
import { executeEbtcRedeem } from '@/services/beam/processor/executor-ebtc-redeem';
import { findIncompleteBeams, removeBeamState } from '@/services/beam/core/persistence';
import { useWallet } from '@/stores/walletStore';

const BeamOperationsContext = createContext(null);

export function useBeamOperations() {
  const ctx = useContext(BeamOperationsContext);
  if (!ctx) throw new Error('useBeamOperations must be used within BeamOperationsProvider');
  return ctx;
}

// ── Reducer ─────────────────────────────────────────────────────────────────

const MAX_OPERATIONS = 10;
const initialState = { operations: [], isPanelOpen: false };

function reducer(state, action) {
  switch (action.type) {
    case 'QUEUE': {
      if (state.operations.some(op => op.id === action.operation.id)) return state;
      const ops = [action.operation, ...state.operations].slice(0, MAX_OPERATIONS);
      return { ...state, operations: ops, isPanelOpen: true };
    }
    case 'UPDATE_PHASE':
      return {
        ...state,
        operations: state.operations.map(op => {
          if (op.id !== action.id) return op;
          const steps = [...(op.steps || [])];
          const lastStep = steps[steps.length - 1];
          if (!lastStep || lastStep.phase !== action.phase) {
            if (lastStep && !lastStep.completedAt) lastStep.completedAt = Date.now();
            steps.push({ phase: action.phase, message: action.statusMessage, startedAt: Date.now(), completedAt: null });
          } else {
            lastStep.message = action.statusMessage;
          }
          return { ...op, phase: action.phase, statusMessage: action.statusMessage, startedAt: op.startedAt ?? Date.now(), steps, interrupted: false };
        }),
      };
    case 'UPDATE_PAYLOAD':
      // Merge intermediate results from the executor into op.payload so the
      // UI can show txids as each step completes (placeholder tx, beam-out tx, etc).
      return {
        ...state,
        operations: state.operations.map(op =>
          op.id === action.id ? { ...op, payload: { ...op.payload, ...action.patch } } : op
        ),
      };
    case 'COMPLETE':
      return {
        ...state,
        operations: state.operations.map(op =>
          op.id === action.id
            ? { ...op, phase: BEAM_PHASE.COMPLETE, btcTxid: action.btcTxid, adaClaimTxid: action.adaClaimTxid, completedAt: Date.now(), statusMessage: 'Beam complete!' }
            : op
        ),
      };
    case 'ERROR':
      return {
        ...state,
        operations: state.operations.map(op =>
          op.id === action.id
            ? { ...op, phase: BEAM_PHASE.ERROR, failedPhase: op.phase, error: action.error, errorCode: action.errorCode, completedAt: Date.now(), statusMessage: action.error }
            : op
        ),
      };
    case 'RETRY': {
      // Clear error state + reset the active step's timer so the user sees
      // a fresh wait. The executor is idempotent and will re-enter from the
      // last saved checkpoint, skipping already-completed steps.
      return {
        ...state,
        operations: state.operations.map(op => {
          if (op.id !== action.id) return op;
          const steps = [...(op.steps || [])];
          const lastIdx = steps.length - 1;
          if (lastIdx >= 0 && steps[lastIdx].phase === action.phase) {
            steps[lastIdx] = { ...steps[lastIdx], startedAt: Date.now(), completedAt: null, message: 'Retrying...' };
          }
          return { ...op, phase: action.phase, error: null, errorCode: null, completedAt: null, statusMessage: 'Retrying...', steps };
        }),
      };
    }
    case 'DISMISS':
      return { ...state, operations: state.operations.filter(op => op.id !== action.id) };
    case 'SET_PANEL':
      return { ...state, isPanelOpen: action.open };
    case 'TOGGLE_PANEL':
      return { ...state, isPanelOpen: !state.isPanelOpen };
    default:
      return state;
  }
}

// ── Provider ────────────────────────────────────────────────────────────────

export function BeamOperationsProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // G003: seed lives in RAM (walletStore) only after unlock — we
  // never read it from storage anymore. retryBeam / auto-resume use
  // a ref so the latest seedPhrase is always available to async
  // closures without forcing memo invalidation.
  const { seedPhrase } = useWallet();
  const seedRef = useRef(seedPhrase);
  useEffect(() => { seedRef.current = seedPhrase; }, [seedPhrase]);

  const openPanel = useCallback(() => dispatch({ type: 'SET_PANEL', open: true }), []);
  const closePanel = useCallback(() => dispatch({ type: 'SET_PANEL', open: false }), []);
  const togglePanel = useCallback(() => dispatch({ type: 'TOGGLE_PANEL' }), []);

  // Lock BTC UTXOs used by a beam so concurrent ops don't reuse them.
  // Uses the per-operation API so the beam's reservation can be released
  // exactly (and so the send dialog can name "<beam label>" when shortage
  // is caused by this op).
  const lockBeamUtxos = useCallback(async (id, label, payload) => {
    const { reserveForOperation } = await import('@/services/utxo-reservations');
    const toLock = [];
    if (payload.fundingUtxo?.utxoId) toLock.push({ utxoId: payload.fundingUtxo.utxoId });
    if (payload.charmInputs?.length) {
      for (const ci of payload.charmInputs) {
        toLock.push({ utxoId: ci.utxoId || `${ci.txid}:${ci.vout}` });
      }
    }
    if (payload.btcInputUtxo) toLock.push({ utxoId: payload.btcInputUtxo });
    reserveForOperation(id, 'bitcoin', toLock, label || 'Beam operation');
    return toLock;
  }, []);

  const unlockBeamUtxos = useCallback(async (id) => {
    const { releaseOperation } = await import('@/services/utxo-reservations');
    releaseOperation(id);
  }, []);

  // Refresh both chains' state so UI reflects new balances/assets immediately after beam
  const refreshAllBalances = useCallback(async () => {
    try {
      // Refresh Cardano store (balance + UTXOs + assets)
      const { useCardano: cardanoStore } = await import('@/stores/cardanoStore');
      await cardanoStore.getState().refresh?.().catch(() => {});
    } catch {}
    try {
      // Refresh BTC UTXOs
      const { useUTXOs } = await import('@/stores/utxoStore');
      await useUTXOs.getState().refreshUTXOs?.('bitcoin', 'mainnet').catch(() => {});
    } catch {}
  }, []);

  // Shared executor for BTC→ADA
  const runBeam = useCallback((id, label, payload) => {
    const onPhase = (phase, message) => {
      dispatch({ type: 'UPDATE_PHASE', id, phase, statusMessage: message });
    };
    (async () => {
      await lockBeamUtxos(id, label, payload);
      try {
        const result = await executeBeamOut({ beamId: id, ...payload, onPhase });
        dispatch({ type: 'COMPLETE', id, btcTxid: result.btcTxid, adaClaimTxid: result.adaClaimTxid });
        refreshAllBalances().catch(() => {});
      } catch (err) {
        dispatch({ type: 'ERROR', id, error: err?.message || 'Beam failed' });
      } finally {
        await unlockBeamUtxos(id);
      }
    })();
  }, [lockBeamUtxos, unlockBeamUtxos, refreshAllBalances]);

  // Shared executor for ADA→BTC
  const runBeamBack = useCallback((id, label, payload) => {
    const onPhase = (phase, message) => {
      dispatch({ type: 'UPDATE_PHASE', id, phase, statusMessage: message });
    };
    const onCheckpoint = (patch) => {
      dispatch({ type: 'UPDATE_PAYLOAD', id, patch });
    };
    (async () => {
      // Beam-back: the BTC placeholder UTXO must stay reserved for the entire
      // ADA→BTC flow (until the BTC claim consumes it). placeholder.js calls
      // markBatch already; here we register the operation so any UTXOs the
      // executor itself selects/reserves stay scoped to this beam id.
      try {
        const result = await executeBeamBack({ beamId: id, ...payload, onPhase, onCheckpoint });
        dispatch({ type: 'COMPLETE', id, btcTxid: result.btcClaimTxid, adaClaimTxid: result.cardanoBeamOutTxHash });
        refreshAllBalances().catch(() => {});
      } catch (err) {
        console.error('[BeamBack] failed:', err);
        const msg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err)) || 'Beam back failed';
        dispatch({ type: 'ERROR', id, error: msg });
      } finally {
        const { releaseOperation } = await import('@/services/utxo-reservations');
        releaseOperation(id);
      }
    })();
  }, [refreshAllBalances]);

  // Start a BTC→ADA beam — immediately executes
  const startBeam = useCallback((label, payload) => {
    const id = crypto.randomUUID();
    dispatch({
      type: 'QUEUE',
      operation: {
        id, phase: BEAM_PHASE.CREATING_PLACEHOLDER, label,
        statusMessage: 'Starting beam...', startedAt: Date.now(),
        completedAt: null, btcTxid: null, adaClaimTxid: null,
        error: null, payload, steps: [],
      },
    });
    runBeam(id, label, payload);
    return id;
  }, [runBeam]);

  // Shared executor for eBTC (lock BTC + beam to Cardano)
  const runEbtcBeam = useCallback((id, label, payload) => {
    const onPhase = (phase, message) => {
      dispatch({ type: 'UPDATE_PHASE', id, phase, statusMessage: message });
    };
    (async () => {
      await lockBeamUtxos(id, label, payload);
      try {
        const result = await executeEbtcBeam({ beamId: id, ...payload, onPhase });
        dispatch({ type: 'COMPLETE', id, btcTxid: result.btcTxid, adaClaimTxid: result.adaClaimTxid });
        refreshAllBalances().catch(() => {});
      } catch (err) {
        dispatch({ type: 'ERROR', id, error: err?.message || 'eBTC beam failed' });
      } finally {
        await unlockBeamUtxos(id);
      }
    })();
  }, [lockBeamUtxos, unlockBeamUtxos, refreshAllBalances]);

  // Shared executor for eBTC redeem (ADA → BTC, burn + vault release)
  const runEbtcRedeem = useCallback((id, label, payload) => {
    const onPhase = (phase, message) => {
      dispatch({ type: 'UPDATE_PHASE', id, phase, statusMessage: message });
    };
    (async () => {
      try {
        const result = await executeEbtcRedeem({ beamId: id, ...payload, onPhase });
        dispatch({ type: 'COMPLETE', id, btcTxid: result.btcTxid, adaClaimTxid: result.adaClaimTxid });
        refreshAllBalances().catch(() => {});
      } catch (err) {
        dispatch({ type: 'ERROR', id, error: err?.message || 'eBTC redeem failed', errorCode: err?.code });
      } finally {
        const { releaseOperation } = await import('@/services/utxo-reservations');
        releaseOperation(id);
      }
    })();
  }, [refreshAllBalances]);

  // Retry: re-run an errored beam from its last saved checkpoint.
  // The executor is idempotent (skips steps with already-persisted results),
  // so retry picks up exactly where it left off. Used when e.g. the user
  // added more BTC funds after an INSUFFICIENT_FUNDS error.
  //
  // IMPORTANT: if the cached Bitcoin spell tx exists (redeemSpellTxHex), it
  // references a specific set of input UTXOs. If the error was Scrolls
  // "insufficient fee" or similar spell-level issue, we must invalidate the
  // cached tx so the executor rebuilds with fresh funding selection.
  const retryBeam = useCallback(async (id) => {
    const op = state.operations.find(o => o.id === id);
    if (!op) return;
    const { loadBeamState, saveBeamState } = await import('@/services/beam/core/persistence');
    const saved = loadBeamState(id);
    if (!saved) {
      console.warn('[retryBeam] No saved state for', id);
      return;
    }
    const seedPhrase = seedRef.current;
    if (!seedPhrase) {
      console.warn('[retryBeam] No seed phrase in RAM — wallet locked');
      return;
    }
    // If the error occurred after the spell tx was built, invalidate it so
    // the retry reconstructs the spell with current strategy (e.g. smaller
    // funding UTXOs to keep Scrolls fee predictable).
    const shouldRebuildSpell =
      op.errorCode === 'INSUFFICIENT_FUNDS' ||
      (saved.redeemSpellTxHex && /Scrolls|insufficient fee|prev_tx|prover/i.test(op.error || ''));
    if (shouldRebuildSpell) {
      console.log('[retryBeam] Invalidating cached redeem spell tx to force rebuild');
      saved.redeemSpellTxHex = null;
      // Also clear stored funding so the executor picks fresh UTXOs
      saved.btcFundingUtxos = null;
      saved.btcFundingUtxo = null;
      saved.btcFundingSats = null;
      saveBeamState(id, saved);
    }
    // Reset to the last saved phase (not ERROR) so executor re-enters naturally
    dispatch({ type: 'RETRY', id, phase: saved.phase || BEAM_PHASE.CREATING_PLACEHOLDER });
    const resumePayload = { ...saved, seedPhrase, network: saved.btcNetwork || 'mainnet' };
    const direction = saved.direction || op.payload?.direction;
    const opLabel = op.label || '';
    if (direction === 'ebtc-ada-to-btc') runEbtcRedeem(id, opLabel, resumePayload);
    else if (direction === 'ebtc-btc-to-ada') runEbtcBeam(id, opLabel, resumePayload);
    else if (direction === 'ada-to-btc') runBeamBack(id, opLabel, resumePayload);
    else runBeam(id, opLabel, resumePayload);
  }, [state.operations, runEbtcRedeem, runEbtcBeam, runBeamBack, runBeam]);

  const startEbtcRedeem = useCallback((label, payload) => {
    const id = crypto.randomUUID();
    dispatch({
      type: 'QUEUE',
      operation: {
        id, phase: BEAM_PHASE.CREATING_PLACEHOLDER, label,
        statusMessage: 'Starting eBTC redeem...', startedAt: Date.now(),
        completedAt: null, btcTxid: null, adaClaimTxid: null,
        error: null, payload, steps: [],
      },
    });
    runEbtcRedeem(id, label, payload);
    return id;
  }, [runEbtcRedeem]);

  // Start an eBTC beam (lock BTC + beam to Cardano)
  const startEbtcBeam = useCallback((label, payload) => {
    const id = crypto.randomUUID();
    dispatch({
      type: 'QUEUE',
      operation: {
        id, phase: BEAM_PHASE.CREATING_PLACEHOLDER, label,
        statusMessage: 'Starting eBTC mint + beam...', startedAt: Date.now(),
        completedAt: null, btcTxid: null, adaClaimTxid: null,
        error: null, payload, steps: [],
      },
    });
    runEbtcBeam(id, label, payload);
    return id;
  }, [runEbtcBeam]);

  // Start an ADA→BTC beam-back — immediately executes
  const startBeamBack = useCallback((label, payload) => {
    const id = crypto.randomUUID();
    dispatch({
      type: 'QUEUE',
      operation: {
        id, phase: BEAM_PHASE.CREATING_PLACEHOLDER, label,
        statusMessage: 'Starting beam back...', startedAt: Date.now(),
        completedAt: null, btcTxid: null, adaClaimTxid: null,
        error: null, payload, steps: [],
      },
    });
    runBeamBack(id, label, payload);
    return id;
  }, [runBeamBack]);

  // Auto-resume incomplete beams from localStorage. Fires each time
  // the wallet transitions from locked → unlocked (seedPhrase null →
  // non-null). The ref prevents double-fire WITHIN a single unlocked
  // session (StrictMode, HMR), but resets on lock so a subsequent
  // unlock can resume beams that arrived in the meantime.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (!seedPhrase) {
      resumedRef.current = false;   // lock cycle — re-arm for next unlock
      return;
    }
    if (resumedRef.current) return;
    const incomplete = findIncompleteBeams();
    if (!incomplete.length) return;
    resumedRef.current = true;

    (async () => {

      for (const { id, state: saved } of incomplete) {
        const direction = saved.direction || 'btc-to-ada';
        let label;
        if (direction === 'ebtc-ada-to-btc') {
          const amt = saved.redeemAmount ?? 0;
          label = `${(amt / 1e8).toFixed(8)} eBTC → Bitcoin`;
        } else if (direction === 'ebtc-btc-to-ada') {
          label = `${saved.lockSats?.toLocaleString() || '?'} sats → eBTC → Cardano`;
        } else if (direction === 'ada-to-btc') {
          const amt = saved.beamAmount ?? 0;
          label = `${(amt / 1e8).toFixed(2)} → Bitcoin`;
        } else {
          label = saved.beamAmount
            ? `${(saved.beamAmount / 1e8).toFixed(2)} → Cardano`
            : 'Beam → Cardano';
        }

        dispatch({
          type: 'QUEUE',
          operation: {
            id,
            phase: saved.phase || BEAM_PHASE.CREATING_PLACEHOLDER,
            label,
            statusMessage: `Resuming from: ${saved.phase}...`,
            startedAt: saved.updatedAt || Date.now(),
            completedAt: null,
            btcTxid: saved.btcTxid || null,
            adaClaimTxid: saved.adaClaimTxid || null,
            error: null,
            payload: saved,
            steps: [],
            interrupted: false,
          },
        });

        const resumePayload = {
          ...saved,
          seedPhrase,
          network: saved.btcNetwork || 'mainnet',
        };

        // For any redeem that has a cached spell tx but was never broadcast,
        // invalidate it. The last attempt failed somewhere (Scrolls, sign,
        // broadcast) so the cached tx is stale. Forces the executor to
        // rebuild with current strategy (correct Scrolls fee, fresh funding).
        // Once btcRedeemTxid is set, we preserve everything (success).
        console.log(`[auto-resume] direction=${direction} phase=${saved.phase} hasSpell=${!!saved.redeemSpellTxHex} hasBtcTxid=${!!saved.btcRedeemTxid}`);
        if (direction === 'ebtc-ada-to-btc' && !saved.btcRedeemTxid && saved.redeemSpellTxHex) {
          console.log('[auto-resume] Invalidating cached redeem spell for fresh rebuild');
          resumePayload.redeemSpellTxHex = null;
          resumePayload.btcFundingUtxos = null;
          resumePayload.btcFundingUtxo = null;
          resumePayload.btcFundingSats = null;
          // Persist the cleared state so next restart also rebuilds
          const { saveBeamState } = await import('@/services/beam/core/persistence');
          saveBeamState(id, {
            ...saved,
            redeemSpellTxHex: null,
            btcFundingUtxos: null,
            btcFundingUtxo: null,
            btcFundingSats: null,
          });
        }

        const resumeLabel = saved.label || '';
        if (direction === 'ada-to-btc') {
          runBeamBack(id, resumeLabel, resumePayload);
        } else if (direction === 'ebtc-btc-to-ada') {
          runEbtcBeam(id, resumeLabel, resumePayload);
        } else if (direction === 'ebtc-ada-to-btc') {
          runEbtcRedeem(id, resumeLabel, resumePayload);
        } else {
          runBeam(id, resumeLabel, resumePayload);
        }
      }
    })();
  }, [seedPhrase, runBeam, runBeamBack, runEbtcBeam, runEbtcRedeem]);

  // Dismiss + clean localStorage
  const dismissBeam = useCallback((id) => {
    removeBeamState(id);
    dispatch({ type: 'DISMISS', id });
  }, []);

  const hasActiveOperations = useMemo(
    () => state.operations.some(op => isActivePhase(op.phase)),
    [state.operations]
  );

  const value = {
    operations: state.operations, isPanelOpen: state.isPanelOpen,
    openPanel, closePanel, togglePanel, startBeam, startBeamBack, startEbtcBeam, startEbtcRedeem, dismissBeam, retryBeam, hasActiveOperations,
  };

  return <BeamOperationsContext.Provider value={value}>{children}</BeamOperationsContext.Provider>;
}
