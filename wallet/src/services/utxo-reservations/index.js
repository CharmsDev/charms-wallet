/**
 * UTXO Reservations — chain-agnostic public API.
 *
 * One in-memory singleton tracks "spent but not yet confirmed" UTXOs
 * per chain. Used to prevent double-selection across concurrent operations
 * (regular sends, charm transfers, beams, redeems) within a single session.
 *
 * Pattern: mirror of charms-cast/webapp WalletContext.spentUtxoIds.
 *   - Mark only AFTER successful broadcast
 *   - Auto-cleanup when chain refresh confirms the UTXO is gone
 *   - No persistence (cleared on page reload)
 *
 * Chain prefix is required; never cross-contaminate Bitcoin and Cardano sets.
 *
 * Public API:
 *   markSpent(chain, txid, vout)
 *   release(chain, txid, vout)
 *   isSpent(chain, txid, vout)        → boolean
 *   getSpentSet(chain)                → new Set (snapshot)
 *   markBatch(chain, items)           → items can be {utxoId} or {txid|txHash, vout|outputIndex}
 *   syncWithChain(chain, onChainKeys) → drop reservations no longer on-chain
 *   clearChain(chain)
 *   stats()
 *
 * Supported chains: 'bitcoin', 'cardano'. Add more as needed.
 */

import { reservationStore } from './reservation-store';

const SUPPORTED = new Set(['bitcoin', 'cardano']);

function check(chain) {
  if (!SUPPORTED.has(chain)) {
    throw new Error(`utxo-reservations: unknown chain "${chain}". Supported: ${[...SUPPORTED].join(', ')}`);
  }
}

export function markSpent(chain, txid, vout) {
  check(chain);
  return reservationStore.add(chain, txid, vout);
}

export function release(chain, txid, vout) {
  check(chain);
  return reservationStore.remove(chain, txid, vout);
}

export function isSpent(chain, txid, vout) {
  check(chain);
  return reservationStore.has(chain, txid, vout);
}

export function getSpentSet(chain) {
  check(chain);
  return reservationStore.snapshot(chain);
}

/**
 * Mark a batch of UTXOs as spent. Accepts mixed shapes:
 *   - { utxoId: "txid:vout" }
 *   - { txid, vout }
 *   - { txHash, outputIndex }   (Cardano native shape)
 *   - "txid:vout" string
 */
export function markBatch(chain, items) {
  check(chain);
  if (!Array.isArray(items)) return 0;
  let n = 0;
  for (const it of items) {
    let txid, vout;
    if (typeof it === 'string') {
      [txid, vout] = it.split(':');
    } else if (it && typeof it === 'object') {
      if (it.utxoId) {
        [txid, vout] = it.utxoId.split(':');
      } else {
        txid = it.txid ?? it.txHash;
        vout = it.vout ?? it.outputIndex;
      }
    }
    if (txid == null || vout == null || vout === '') continue;
    if (reservationStore.add(chain, txid, parseInt(vout, 10))) n++;
  }
  return n;
}

/**
 * Drop any reservation that no longer corresponds to an on-chain UTXO.
 * Call after a chain refresh: pass the Set/Array of "txid:vout" keys
 * that ARE currently on-chain. Anything reserved but not on-chain is
 * either confirmed (consumed) or never made it (dropped from mempool).
 */
export function syncWithChain(chain, onChainKeys) {
  check(chain);
  const onChain = onChainKeys instanceof Set ? onChainKeys : new Set(onChainKeys);
  const reserved = reservationStore.snapshot(chain);
  let dropped = 0;
  for (const key of reserved) {
    if (!onChain.has(key)) {
      const [txid, voutStr] = key.split(':');
      reservationStore.remove(chain, txid, parseInt(voutStr, 10));
      dropped++;
    }
  }
  return dropped;
}

export function clearChain(chain) {
  check(chain);
  return reservationStore.clearChain(chain);
}

export function stats() {
  return reservationStore.stats();
}

// Convenience namespace export
export const reservations = {
  markSpent,
  release,
  isSpent,
  getSpentSet,
  markBatch,
  syncWithChain,
  clearChain,
  stats,
};
