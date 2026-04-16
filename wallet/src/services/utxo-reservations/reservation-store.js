/**
 * UTXO Reservation Store — internal singleton.
 *
 * Persisted to localStorage so reservations survive page reloads.
 * This is critical for multi-minute beam operations: the beam state
 * persists in localStorage, and the UTXOs it locked must also persist,
 * otherwise a refresh could allow a concurrent send to double-spend them.
 *
 * Per-chain Set<string> keyed by "txid:vout" (or "txHash:outputIndex").
 * Both Bitcoin and Cardano use the same key shape.
 *
 * Do not import this file directly — use the public API in `./index.js`.
 */

const STORAGE_KEY = 'charms_utxo_reservations';

/** Load persisted state from localStorage. */
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw);
    const m = new Map();
    for (const [chain, arr] of Object.entries(obj)) {
      m.set(chain, new Set(arr));
    }
    return m;
  } catch {
    return new Map();
  }
}

/** Persist current state to localStorage. */
function saveToStorage() {
  try {
    const obj = {};
    for (const [chain, s] of sets) {
      obj[chain] = [...s];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {}
}

const sets = loadFromStorage();

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
  saveToStorage();
  return true;
}

/** Release a UTXO. Idempotent. */
function remove(chain, txid, vout) {
  const s = setForChain(chain);
  const key = makeKey(txid, vout);
  if (!s.has(key)) return false;
  s.delete(key);
  saveToStorage();
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

/** Clear all reservations for a chain. */
function clearChain(chain) {
  const s = sets.get(chain);
  if (!s) return 0;
  const n = s.size;
  s.clear();
  saveToStorage();
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
