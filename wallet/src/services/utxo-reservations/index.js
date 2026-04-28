/**
 * UTXO Reservations — chain-agnostic public API.
 *
 * Two views over the same underlying store (see ./reservation-store.js):
 *
 *   - Flat per-chain Set<"txid:vout">: the hot-path lookup used by
 *     selectors. Use `markSpent`/`markBatch`/`isSpent`/`getSpentSet` for
 *     ad-hoc protection (e.g. broadcast-time safety net).
 *
 *   - Per-operation tracking: `reserveForOperation(opId, chain, items,
 *     label)` registers a list of UTXOs *under* an operation so the
 *     caller can later `releaseOperation(opId)` to free exactly what it
 *     took on cancel/failure. The UI can call `findOperationByKey` to
 *     surface "this UTXO is held by `<label>`" instead of an opaque
 *     "no funds" error.
 *
 * Both views are persisted to localStorage (`charms_utxo_reservations`)
 * so reservations survive page reloads — beam ops can run for tens of
 * minutes and a reload mid-flight must not free UTXOs the in-flight tx
 * still depends on.
 *
 * Auto-cleanup: `syncWithChain(chain, onChainKeys)` (called from chain
 * refresh) drops every flat-set entry whose UTXO is no longer on-chain.
 * Any operations that still reference those keys keep their entry but
 * their items list naturally shortens; releaseOperation is the canonical
 * way to clear them.
 *
 * Chain prefix is required; never cross-contaminate Bitcoin and Cardano.
 * Supported chains: 'bitcoin', 'cardano'. Add more as needed.
 *
 * Public API:
 *   markSpent(chain, txid, vout)
 *   release(chain, txid, vout)
 *   isSpent(chain, txid, vout)            → boolean
 *   getSpentSet(chain)                    → new Set (snapshot)
 *   markBatch(chain, items)               → items: {utxoId}|{txid,vout}|{txHash,outputIndex}|"txid:vout"
 *   syncWithChain(chain, onChainKeys)     → drop reservations no longer on-chain
 *   clearChain(chain)
 *   stats()
 *
 *   reserveForOperation(opId, chain, items, label?)  → add to op + flat set
 *   appendToOperation(opId, items)                   → add more items to an existing op
 *   releaseOperation(opId)                           → remove every item the op holds
 *   findOperationByKey(chain, key)                   → { opId, label, items, ... } | null
 *   getActiveOperations(chain?)                      → list of active ops
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

// ─── Per-operation tracking ─────────────────────────────────────────────

export function reserveForOperation(opId, chain, items, label = '') {
  check(chain);
  return reservationStore.reserveForOperation(opId, chain, items, label);
}

export function appendToOperation(opId, items) {
  return reservationStore.appendToOperation(opId, items);
}

export function releaseOperation(opId) {
  return reservationStore.releaseOperation(opId);
}

export function findOperationByKey(chain, key) {
  check(chain);
  return reservationStore.findOperationByKey(chain, key);
}

export function getActiveOperations(chain) {
  if (chain) check(chain);
  return reservationStore.getActiveOperations(chain);
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
  reserveForOperation,
  appendToOperation,
  releaseOperation,
  findOperationByKey,
  getActiveOperations,
};
