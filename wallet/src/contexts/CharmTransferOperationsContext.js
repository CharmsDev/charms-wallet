'use client';

/**
 * Charm Transfer Operations Context.
 *
 * Background runner for charm (BRO etc.) transfers — mirrors
 * BeamOperationsContext. Each transfer survives page reloads because every
 * phase transition is checkpointed to localStorage; on next unlock the
 * incomplete ops auto-resume from where they stopped.
 *
 * The prover caches by (spell, payload) so re-sending the same body after
 * a reload returns the same unsigned tx — the resume is idempotent.
 *
 * Public API:
 *   const { startCharmTransfer, retryCharmTransfer, dismissCharmTransfer,
 *           operations, getOperation } = useCharmTransferOperations();
 */

import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import { useWallet } from '@/stores/walletStore';
import { useBlockchain } from '@/stores/blockchainStore';
import { useWalletSync } from '@/hooks/useWalletSync';
import { proveCharmTransfer, signAndBroadcastTransfer } from '@/services/charm-transfer';
import { balanceService } from '@/services/balance';
import { applyBroadcastedTx } from '@/services/wallet/post-broadcast';
import { useAddresses } from '@/stores/addressesStore';
import {
  CHARM_TRANSFER_PHASE,
  saveCharmTransferState,
  loadCharmTransferState,
  removeCharmTransferState,
  findIncompleteCharmTransfers,
  serializePrevTxMap,
  deserializePrevTxMap,
} from '@/services/charm-transfer/persistence';

const CharmTransferOperationsContext = createContext(null);

export function useCharmTransferOperations() {
  const ctx = useContext(CharmTransferOperationsContext);
  if (!ctx) throw new Error('useCharmTransferOperations must be used within CharmTransferOperationsProvider');
  return ctx;
}

// ── Reducer ─────────────────────────────────────────────────────────────────

const MAX_OPERATIONS = 12;
const initialState = { operations: [] };

function reducer(state, action) {
  switch (action.type) {
    case 'QUEUE': {
      if (state.operations.some(op => op.id === action.operation.id)) return state;
      return { operations: [action.operation, ...state.operations].slice(0, MAX_OPERATIONS) };
    }
    case 'UPDATE':
      return {
        operations: state.operations.map(op =>
          op.id === action.id ? { ...op, ...action.patch } : op,
        ),
      };
    case 'COMPLETE':
      return {
        operations: state.operations.map(op =>
          op.id === action.id
            ? { ...op, phase: CHARM_TRANSFER_PHASE.COMPLETE, txid: action.txid, statusMessage: 'Transfer complete', completedAt: Date.now() }
            : op,
        ),
      };
    case 'ERROR':
      return {
        operations: state.operations.map(op =>
          op.id === action.id
            ? { ...op, phase: CHARM_TRANSFER_PHASE.ERROR, error: action.error, statusMessage: action.error, completedAt: Date.now() }
            : op,
        ),
      };
    case 'DISMISS':
      return { operations: state.operations.filter(op => op.id !== action.id) };
    default:
      return state;
  }
}

// ── Provider ────────────────────────────────────────────────────────────────

export function CharmTransferOperationsProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Seed in RAM only after unlock; ref keeps the runner reading the latest
  // value without invalidating the memoised runner on every render.
  const { seedPhrase } = useWallet();
  const seedRef = useRef(seedPhrase);
  useEffect(() => { seedRef.current = seedPhrase; }, [seedPhrase]);

  const { activeNetwork } = useBlockchain();
  const { syncAfterCharmTransfer, syncFullWallet } = useWalletSync();
  const { addresses } = useAddresses();
  const ownAddressesRef = useRef(addresses);
  useEffect(() => { ownAddressesRef.current = addresses; }, [addresses]);

  const updateOp = useCallback((id, patch, persist = true) => {
    dispatch({ type: 'UPDATE', id, patch });
    if (persist) {
      const prev = loadCharmTransferState(id) || {};
      saveCharmTransferState(id, { ...prev, ...patch });
    }
  }, []);

  // The runner. Idempotent — re-entering after a reload picks up at the
  // saved phase, skipping work that already produced a result.
  const runCharmTransfer = useCallback(async (id) => {
    const saved = loadCharmTransferState(id);
    if (!saved) return;

    const childOpIds = saved.childOpIds || [];
    const network = saved.network || activeNetwork;
    const failParent = async (msg) => {
      try { await balanceService.markFailed(id, msg); } catch {}
      for (const c of childOpIds) { try { await balanceService.markFailed(c, msg); } catch {} }
      dispatch({ type: 'ERROR', id, error: msg });
      updateOp(id, { phase: CHARM_TRANSFER_PHASE.ERROR, error: msg });
    };

    try {
      if (!seedRef.current) throw new Error('Wallet locked. Please unlock and retry.');

      // Phase 1 — prove (skip if we already have the spell tx)
      let spellTxHex = saved.spellTxHex;
      let prevTxMap  = deserializePrevTxMap(saved.prevTxMap);
      let fee        = saved.fee;

      if (!spellTxHex) {
        updateOp(id, { phase: CHARM_TRANSFER_PHASE.PROVING, statusMessage: 'Generating ZK proof…' });
        const result = await proveCharmTransfer({
          tokenAppId: saved.tokenAppId,
          charmInputs: saved.charmInputs,
          fundingUtxo: saved.fundingUtxo,
          transferAmount: saved.transferAmount,
          recipientAddress: saved.recipientAddress,
          changeAddress: saved.changeAddress,
          network,
          feeRate: saved.feeRate,
          onStatus: (msg) => updateOp(id, { statusMessage: msg }, false),
        });
        spellTxHex = result.spellTxHex;
        prevTxMap  = result.prevTxMap;
        fee        = result.fee;
        updateOp(id, {
          spellTxHex,
          prevTxMap: serializePrevTxMap(prevTxMap),
          fee,
        });
      }

      // Phase 2 — sign + broadcast (skip if we already have a txid)
      let txid = saved.txid;
      if (!txid) {
        updateOp(id, { phase: CHARM_TRANSFER_PHASE.BROADCASTING, statusMessage: 'Signing and broadcasting…' });
        if (!seedRef.current) throw new Error('Wallet locked. Please unlock and retry.');
        const r = await signAndBroadcastTransfer({
          spellTxHex,
          prevTxMap,
          inputSigningMap: saved.inputSigningMap,
          seedPhrase: seedRef.current,
          network,
          onStatus: (msg) => updateOp(id, { statusMessage: msg }, false),
        });
        txid = r.txid;
        updateOp(id, { txid });
      }

      // Single post-broadcast entry point: advances BalanceService pendings
      // (parent + children), drops spent UTXOs/charms from the local stores,
      // and records the tx in transactionStore so Recent Transactions shows
      // it without waiting for the indexer.
      try {
        // Need the signed tx hex to parse. signAndBroadcastTransfer returns
        // only the txid, but we can re-fetch from the prover output if we
        // persisted it. For now we hand the existing spell tx hex (the
        // signed one is also derivable from prevTxMap+inputSigningMap+seed
        // but we already have the broadcast result). Reconstructing the
        // signed hex from txid would require a chain fetch — instead the
        // signer should return it. For simplicity here we pass spellTxHex
        // (unsigned) — the parser only reads vin/vout shape, which is the
        // same in signed and unsigned txs (witnesses don't change the
        // outputs structure).
        await applyBroadcastedTx({
          signedTxHex: spellTxHex,
          txid,
          network,
          opId: id,
          childOpIds,
          ownAddresses: ownAddressesRef.current || [],
          txType: 'charm_transfer',
          label: saved.label,
          charmContext: {
            tokenAppId: saved.tokenAppId,
            transferAmount: saved.transferAmount,
            recipientAddress: saved.recipientAddress,
            name: saved.charmName,
            ticker: saved.charmTicker,
          },
          feePaid: fee || 0,
        });
      } catch (e) { console.error('[charm-transfer] applyBroadcastedTx failed:', e); }

      // Best-effort chain sync — only flips status, never re-derives data.
      try {
        await syncAfterCharmTransfer({
          inputAddresses: (saved.selectedCharmAddresses || []).filter(Boolean),
          changeAddress: saved.changeAddress,
          fundingAddress: saved.fundingUtxo?.address,
        });
        await syncFullWallet();
      } catch (e) { console.warn('[charm-transfer] post-broadcast sync failed:', e?.message); }

      dispatch({ type: 'COMPLETE', id, txid });
      updateOp(id, { phase: CHARM_TRANSFER_PHASE.COMPLETE, txid, statusMessage: 'Transfer complete' });
    } catch (err) {
      await failParent(err?.message || 'Transfer failed');
    }
  }, [activeNetwork, syncAfterCharmTransfer, syncFullWallet, updateOp]);

  // Public: kick off a new transfer.
  const startCharmTransfer = useCallback((label, payload) => {
    const id = payload.opId;   // reuse the BalanceService opId so everything links
    const operation = {
      id, label, phase: CHARM_TRANSFER_PHASE.QUEUED,
      statusMessage: 'Queued…', startedAt: Date.now(), completedAt: null,
      txid: null, error: null,
    };
    dispatch({ type: 'QUEUE', operation });
    saveCharmTransferState(id, {
      ...payload,
      label,
      phase: CHARM_TRANSFER_PHASE.QUEUED,
      network: payload.network || activeNetwork,
    });
    // Fire and forget — runner picks up the saved state.
    runCharmTransfer(id);
    return id;
  }, [activeNetwork, runCharmTransfer]);

  const retryCharmTransfer = useCallback((id) => {
    dispatch({ type: 'UPDATE', id, patch: { phase: CHARM_TRANSFER_PHASE.QUEUED, error: null, statusMessage: 'Retrying…' } });
    runCharmTransfer(id);
  }, [runCharmTransfer]);

  const dismissCharmTransfer = useCallback((id) => {
    removeCharmTransferState(id);
    dispatch({ type: 'DISMISS', id });
  }, []);

  const getOperation = useCallback((id) => state.operations.find(o => o.id === id) || null, [state.operations]);

  // Auto-resume on unlock. Mirrors BeamOperationsContext: re-arms on lock
  // cycle (seedPhrase null → not-null) so a subsequent unlock continues
  // any transfers that arrived in the meantime.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (!seedPhrase) { resumedRef.current = false; return; }
    if (resumedRef.current) return;
    resumedRef.current = true;

    const incomplete = findIncompleteCharmTransfers();
    for (const { id, state: saved } of incomplete) {
      dispatch({
        type: 'QUEUE',
        operation: {
          id,
          label: saved.label || 'Charm Transfer',
          phase: saved.phase || CHARM_TRANSFER_PHASE.QUEUED,
          statusMessage: `Resuming from ${saved.phase}…`,
          startedAt: saved.updatedAt || Date.now(),
          completedAt: null,
          txid: saved.txid || null,
          error: null,
        },
      });
      runCharmTransfer(id);
    }
  }, [seedPhrase, runCharmTransfer]);

  const value = {
    operations: state.operations,
    startCharmTransfer,
    retryCharmTransfer,
    dismissCharmTransfer,
    getOperation,
  };

  return (
    <CharmTransferOperationsContext.Provider value={value}>
      {children}
    </CharmTransferOperationsContext.Provider>
  );
}
