/**
 * UTXO Reservation Store — internal singleton.
 *
 * In-memory only. No localStorage. Resets on page reload (intended).
 * Mirrors the WalletContext pattern from charms-cast/webapp.
 *
 * Per-chain Set<string> keyed by "txid:vout" (or "txHash:outputIndex").
 * Both Bitcoin and Cardano use the same key shape since they're both
 * "<32-byte-hex>:<integer>".
 *
 * Do not import this file directly — use the public API in `./index.js`.
 */

const sets = new Map();  // chain → Set<string>

/** Get-or-create a Set for the given chain. */
function setForChain(chain) {
  let s = sets.get(chain);
  if (!s) {
    s = new Set();
    sets.set(chain, s);
  }
  return s;
}

/** Build the canonical key. */
function makeKey(txid, vout) {
  if (txid == null || vout == null) {
    throw new Error('reservation-store: txid and vout are required');
  }
  return `${txid}:${vout}`;
}

/** Mark a UTXO as spent for the given chain. Idempotent. */
function add(chain, txid, vout) {
  const s = setForChain(chain);
  const key = makeKey(txid, vout);
  if (s.has(key)) return false;
  s.add(key);
  console.log(`[Reservations] mark ${chain} ${key} (total reserved on ${chain}: ${s.size})`);
  return true;
}

/** Release a UTXO. Idempotent. */
function remove(chain, txid, vout) {
  const s = setForChain(chain);
  const key = makeKey(txid, vout);
  if (!s.has(key)) return false;
  s.delete(key);
  console.log(`[Reservations] release ${chain} ${key}`);
  return true;
}

/** Check if a UTXO is reserved. */
function has(chain, txid, vout) {
  const s = sets.get(chain);
  if (!s) return false;
  return s.has(makeKey(txid, vout));
}

/** Get a snapshot copy of the Set for the given chain. */
function snapshot(chain) {
  const s = sets.get(chain);
  return s ? new Set(s) : new Set();
}

/** Clear all reservations for a chain (debug/test). */
function clearChain(chain) {
  const s = sets.get(chain);
  if (!s) return 0;
  const n = s.size;
  s.clear();
  console.log(`[Reservations] cleared ${chain} (${n} entries)`);
  return n;
}

/** Stats for debug UI. */
function stats() {
  const out = {};
  for (const [chain, s] of sets) out[chain] = s.size;
  return out;
}

export const reservationStore = {
  add,
  remove,
  has,
  snapshot,
  clearChain,
  stats,
  makeKey,
};
