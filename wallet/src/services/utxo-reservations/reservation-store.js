/**
 * UTXO Reservation Store — internal singleton.
 *
 * Two layers, one source of truth:
 *
 *   1. `sets` — per-chain Set<"txid:vout">. The hot-path lookup used by
 *      every UTXO selector to decide "is this spendable right now?".
 *
 *   2. `operations` — per-operation map (opId → { chain, label, items[],
 *      createdAt }). Lets callers release exactly what they took on
 *      cancel/failure, and lets the UI tell the user *which* operation
 *      is holding a UTXO when a parallel send would otherwise look like
 *      "no funds".
 *
 * `reserveForOperation` adds to BOTH; `releaseOperation` removes from
 * BOTH; ad-hoc `add`/`remove` only touch the set (broadcast safety
 * net — those don't need op tracking because the UTXO is already on its
 * way to becoming consumed and `syncWithChain` will reap it).
 *
 * Persisted to localStorage so reservations survive page reloads — beam
 * ops can run for tens of minutes and a reload mid-flight must not free
 * UTXOs the in-flight tx still depends on. The two structures are saved
 * under one key as a single JSON blob.
 *
 * Do not import this file directly — use the public API in `./index.js`.
 */

const STORAGE_KEY = 'charms_utxo_reservations';

/** Load persisted state from localStorage. */
function loadFromStorage() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return { sets: new Map(), operations: new Map() };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { sets: new Map(), operations: new Map() };
    const obj = JSON.parse(raw);

    const sets = new Map();
    // Legacy shape: top-level keys were chain names.
    // New shape: { sets: { chain: [...] }, operations: { opId: {...} } }.
    const setsRaw = obj.sets || obj;
    for (const [chain, arr] of Object.entries(setsRaw)) {
      // Skip the `operations` key when reading legacy-shaped data.
      if (chain === 'operations') continue;
      if (Array.isArray(arr)) sets.set(chain, new Set(arr));
    }

    const operations = new Map();
    for (const [opId, op] of Object.entries(obj.operations || {})) {
      if (op && typeof op === 'object' && Array.isArray(op.items)) {
        operations.set(opId, op);
      }
    }
    return { sets, operations };
  } catch {
    return { sets: new Map(), operations: new Map() };
  }
}

/** Persist current state to localStorage. */
function saveToStorage() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const setsObj = {};
    for (const [chain, s] of sets) setsObj[chain] = [...s];
    const opsObj = {};
    for (const [opId, op] of operations) opsObj[opId] = op;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sets: setsObj, operations: opsObj }));
  } catch {}
}

const { sets, operations } = loadFromStorage();

function setForChain(chain) {
  let s = sets.get(chain);
  if (!s) {
    s = new Set();
    sets.set(chain, s);
  }
  return s;
}

function makeKey(txid, vout) {
  if (txid == null || vout == null) {
    throw new Error('reservation-store: txid and vout are required');
  }
  return `${txid}:${vout}`;
}

function add(chain, txid, vout) {
  const s = setForChain(chain);
  const key = makeKey(txid, vout);
  if (s.has(key)) return false;
  s.add(key);
  saveToStorage();
  return true;
}

function remove(chain, txid, vout) {
  const s = setForChain(chain);
  const key = makeKey(txid, vout);
  if (!s.has(key)) return false;
  s.delete(key);
  saveToStorage();
  return true;
}

function has(chain, txid, vout) {
  const s = sets.get(chain);
  if (!s) return false;
  return s.has(makeKey(txid, vout));
}

function snapshot(chain) {
  const s = sets.get(chain);
  return s ? new Set(s) : new Set();
}

function clearChain(chain) {
  const s = sets.get(chain);
  let n = 0;
  if (s) {
    n = s.size;
    s.clear();
  }
  // Also drop any operation entries for this chain so the two views stay in sync.
  for (const [opId, op] of operations) {
    if (op.chain === chain) operations.delete(opId);
  }
  saveToStorage();
  return n;
}

function stats() {
  const out = { byChain: {}, operations: operations.size };
  for (const [chain, s] of sets) out.byChain[chain] = s.size;
  return out;
}

// ─── Per-operation tracking ─────────────────────────────────────────────

/** Reserve a list of UTXOs *under* an operation. Idempotent on opId — a
 *  second call with the same id replaces the prior entry (callers should
 *  release first if they want different semantics). */
function reserveForOperation(opId, chain, items, label = '') {
  if (!opId) throw new Error('reservation-store: opId is required');
  if (!Array.isArray(items)) items = [];

  // If the op already exists, release its old items first so we don't
  // leak Set entries when the caller re-reserves with a new list.
  if (operations.has(opId)) {
    releaseOperation(opId);
  }

  const keys = [];
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
    const voutN = parseInt(vout, 10);
    if (Number.isNaN(voutN)) continue;
    const s = setForChain(chain);
    s.add(makeKey(txid, voutN));
    keys.push(makeKey(txid, voutN));
  }

  operations.set(opId, {
    chain,
    label: label || '',
    items: keys,
    createdAt: Date.now(),
  });
  saveToStorage();
  return keys.length;
}

/** Append more items to an existing operation's reservation list — useful
 *  when an executor picks up additional UTXOs after the initial lock. */
function appendToOperation(opId, items) {
  if (!operations.has(opId)) return 0;
  const op = operations.get(opId);
  const s = setForChain(op.chain);
  let added = 0;
  for (const it of items || []) {
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
    const voutN = parseInt(vout, 10);
    if (Number.isNaN(voutN)) continue;
    const key = makeKey(txid, voutN);
    if (!s.has(key)) {
      s.add(key);
      added++;
    }
    if (!op.items.includes(key)) op.items.push(key);
  }
  if (added > 0) saveToStorage();
  return added;
}

/** Release every UTXO an operation is holding. Idempotent. */
function releaseOperation(opId) {
  const op = operations.get(opId);
  if (!op) return 0;
  const s = sets.get(op.chain);
  let n = 0;
  if (s) {
    for (const key of op.items) {
      if (s.delete(key)) n++;
    }
  }
  operations.delete(opId);
  saveToStorage();
  return n;
}

/** Find which operation (if any) is holding a given key. */
function findOperationByKey(chain, key) {
  for (const [opId, op] of operations) {
    if (op.chain !== chain) continue;
    if (op.items.includes(key)) return { opId, ...op };
  }
  return null;
}

function getActiveOperations(chain) {
  const out = [];
  for (const [opId, op] of operations) {
    if (chain && op.chain !== chain) continue;
    out.push({ opId, ...op });
  }
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
  reserveForOperation,
  appendToOperation,
  releaseOperation,
  findOperationByKey,
  getActiveOperations,
};
