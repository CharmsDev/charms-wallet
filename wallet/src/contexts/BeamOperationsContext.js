'use client';

/**
 * Beam Operations Context.
 *
 * - Starts beams immediately (no double-confirm)
 * - Tracks step history for vertical progress UI
 * - Persists to localStorage — loads incomplete beams on mount
 * - Dismiss removes from localStorage too
 */

import React, { createContext, useContext, useReducer, useCallback, useMemo, useEffect } from 'react';
import { BEAM_PHASE, isActivePhase } from '@/services/beam/core/types';
import { executeBeamOut } from '@/services/beam/processor/executor';
import { executeBeamBack } from '@/services/beam/processor/executor-beam-back';
import { executeEbtcBeam } from '@/services/beam/processor/executor-ebtc';
import { executeEbtcRedeem } from '@/services/beam/processor/executor-ebtc-redeem';
import { findIncompleteBeams, removeBeamState } from '@/services/beam/core/persistence';

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
            ? { ...op, phase: BEAM_PHASE.ERROR, error: action.error, completedAt: Date.now(), statusMessage: action.error }
            : op
        ),
      };
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

  const openPanel = useCallback(() => dispatch({ type: 'SET_PANEL', open: true }), []);
  const closePanel = useCallback(() => dispatch({ type: 'SET_PANEL', open: false }), []);
  const togglePanel = useCallback(() => dispatch({ type: 'TOGGLE_PANEL' }), []);

  // Lock BTC UTXOs used by a beam so concurrent ops don't reuse them
  const lockBeamUtxos = useCallback(async (payload) => {
    const { utxoSelector } = await import('@/services/utxo/core/selector');
    const toLock = [];
    if (payload.fundingUtxo?.utxoId) {
      const [txid, vout] = payload.fundingUtxo.utxoId.split(':');
      toLock.push({ txid, vout: parseInt(vout) });
    }
    if (payload.charmInputs?.length) {
      for (const ci of payload.charmInputs) {
        const id = ci.utxoId || `${ci.txid}:${ci.vout}`;
        const [txid, vout] = id.split(':');
        toLock.push({ txid, vout: parseInt(vout) });
      }
    }
    if (payload.btcInputUtxo) {
      const [txid, vout] = payload.btcInputUtxo.split(':');
      toLock.push({ txid, vout: parseInt(vout) });
    }
    if (toLock.length) utxoSelector.lockUtxos(toLock);
    return toLock;
  }, []);

  const unlockBeamUtxos = useCallback(async (locked) => {
    if (locked?.length) {
      const { utxoSelector } = await import('@/services/utxo/core/selector');
      utxoSelector.unlockUtxos(locked);
    }
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
  const runBeam = useCallback((id, payload) => {
    const onPhase = (phase, message) => {
      dispatch({ type: 'UPDATE_PHASE', id, phase, statusMessage: message });
    };
    (async () => {
      const locked = await lockBeamUtxos(payload);
      try {
        const result = await executeBeamOut({ beamId: id, ...payload, onPhase });
        await unlockBeamUtxos(locked);
        dispatch({ type: 'COMPLETE', id, btcTxid: result.btcTxid, adaClaimTxid: result.adaClaimTxid });
        refreshAllBalances().catch(() => {});
      } catch (err) {
        await unlockBeamUtxos(locked);
        dispatch({ type: 'ERROR', id, error: err?.message || 'Beam failed' });
      }
    })();
  }, [lockBeamUtxos, unlockBeamUtxos, refreshAllBalances]);

  // Shared executor for ADA→BTC
  const runBeamBack = useCallback((id, payload) => {
    const onPhase = (phase, message) => {
      dispatch({ type: 'UPDATE_PHASE', id, phase, statusMessage: message });
    };
    (async () => {
      try {
        const result = await executeBeamBack({ beamId: id, ...payload, onPhase });
        dispatch({ type: 'COMPLETE', id, btcTxid: result.btcClaimTxid, adaClaimTxid: result.cardanoBeamOutTxHash });
        refreshAllBalances().catch(() => {});
      } catch (err) {
        dispatch({ type: 'ERROR', id, error: err?.message || 'Beam back failed' });
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
    runBeam(id, payload);
    return id;
  }, [runBeam]);

  // Shared executor for eBTC (lock BTC + beam to Cardano)
  const runEbtcBeam = useCallback((id, payload) => {
    const onPhase = (phase, message) => {
      dispatch({ type: 'UPDATE_PHASE', id, phase, statusMessage: message });
    };
    (async () => {
      const locked = await lockBeamUtxos(payload);
      try {
        const result = await executeEbtcBeam({ beamId: id, ...payload, onPhase });
        await unlockBeamUtxos(locked);
        dispatch({ type: 'COMPLETE', id, btcTxid: result.btcTxid, adaClaimTxid: result.adaClaimTxid });
        refreshAllBalances().catch(() => {});
      } catch (err) {
        await unlockBeamUtxos(locked);
        dispatch({ type: 'ERROR', id, error: err?.message || 'eBTC beam failed' });
      }
    })();
  }, [lockBeamUtxos, unlockBeamUtxos, refreshAllBalances]);

  // Shared executor for eBTC redeem (ADA → BTC, burn + vault release)
  const runEbtcRedeem = useCallback((id, payload) => {
    const onPhase = (phase, message) => {
      dispatch({ type: 'UPDATE_PHASE', id, phase, statusMessage: message });
    };
    (async () => {
      try {
        const result = await executeEbtcRedeem({ beamId: id, ...payload, onPhase });
        dispatch({ type: 'COMPLETE', id, btcTxid: result.btcTxid, adaClaimTxid: result.adaClaimTxid });
        refreshAllBalances().catch(() => {});
      } catch (err) {
        dispatch({ type: 'ERROR', id, error: err?.message || 'eBTC redeem failed' });
      }
    })();
  }, [refreshAllBalances]);

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
    runEbtcRedeem(id, payload);
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
    runEbtcBeam(id, payload);
    return id;
  }, [runEbtcBeam]);

  // Start an ADA→BTC beam-back — immediately executes
  const startBeamBack = useCallback((label, payload) => {
    const id = crypto.randomUUID();
    dispatch({
      type: 'QUEUE',
      operation: {
        id, phase: BEAM_PHASE.BUILDING_SPELL, label,
        statusMessage: 'Starting beam back...', startedAt: Date.now(),
        completedAt: null, btcTxid: null, adaClaimTxid: null,
        error: null, payload, steps: [],
      },
    });
    runBeamBack(id, payload);
    return id;
  }, [runBeamBack]);

  // Auto-resume incomplete beams from localStorage on mount
  useEffect(() => {
    const incomplete = findIncompleteBeams();
    if (!incomplete.length) return;

    (async () => {
      const { getSeedPhrase } = await import('@/services/storage');
      const seedPhrase = await getSeedPhrase();
      if (!seedPhrase) return;

      for (const { id, state: saved } of incomplete) {
        const direction = saved.direction || 'btc-to-ada';
        const isEbtc = direction === 'ebtc-btc-to-ada';
        const label = isEbtc
          ? `${saved.lockSats?.toLocaleString() || '?'} sats → eBTC → Cardano`
          : saved.beamAmount
            ? `${(saved.beamAmount / 1e8).toFixed(2)} → Cardano`
            : 'Beam → Cardano';

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

        if (direction === 'ada-to-btc') {
          runBeamBack(id, resumePayload);
        } else if (direction === 'ebtc-btc-to-ada') {
          runEbtcBeam(id, resumePayload);
        } else if (direction === 'ebtc-ada-to-btc') {
          runEbtcRedeem(id, resumePayload);
        } else {
          runBeam(id, resumePayload);
        }
      }
    })();
  }, [runBeam, runBeamBack, runEbtcBeam, runEbtcRedeem]);

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
    openPanel, closePanel, togglePanel, startBeam, startBeamBack, startEbtcBeam, startEbtcRedeem, dismissBeam, hasActiveOperations,
  };

  return <BeamOperationsContext.Provider value={value}>{children}</BeamOperationsContext.Provider>;
}
