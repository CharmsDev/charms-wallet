/**
 * Charm-transfer state persistence.
 *
 * Saves each transfer's progress to localStorage so the operation survives
 * a page reload. The ZK proof step can take 5–10 min — losing it on F5 is
 * unacceptable. Mirrors `services/beam/core/persistence.js`.
 *
 * Schema per entry:
 *   {
 *     phase, label, network, transferAmount, recipientAddress, changeAddress,
 *     tokenAppId, charmInputs, fundingUtxo, inputSigningMap, feeRate,
 *     opId, childOpIds, isInternalTransfer,
 *     spellTxHex?, prevTxMap?, fee?,   // set after prove
 *     txid?,                            // set after broadcast
 *     error?,                           // set on failure
 *     updatedAt,
 *   }
 *
 * prevTxMap is serialised as a plain object (Map → entries) so JSON survives.
 */

const STORAGE_KEY = 'charms_charm_transfers';

export const CHARM_TRANSFER_PHASE = Object.freeze({
  QUEUED:       'queued',
  PROVING:      'proving',
  BROADCASTING: 'broadcasting',
  COMPLETE:     'complete',
  ERROR:        'error',
});

export function isActiveTransferPhase(phase) {
  return phase === CHARM_TRANSFER_PHASE.QUEUED
      || phase === CHARM_TRANSFER_PHASE.PROVING
      || phase === CHARM_TRANSFER_PHASE.BROADCASTING;
}

function safeRead() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function safeWrite(obj) {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); }
  catch (e) { console.warn('[charm-transfer/persistence] write failed:', e?.message); }
}

export function saveCharmTransferState(id, state) {
  const all = safeRead();
  all[id] = { ...state, updatedAt: Date.now() };
  safeWrite(all);
}

export function loadCharmTransferState(id) {
  return safeRead()[id] || null;
}

export function loadAllCharmTransferStates() {
  return safeRead();
}

export function removeCharmTransferState(id) {
  const all = safeRead();
  if (!(id in all)) return;
  delete all[id];
  safeWrite(all);
}

export function findIncompleteCharmTransfers() {
  const all = safeRead();
  return Object.entries(all)
    .filter(([, s]) => isActiveTransferPhase(s.phase))
    .map(([id, state]) => ({ id, state }));
}

// prevTxMap serialisation helpers — Map ⇄ plain object.
export function serializePrevTxMap(map) {
  if (!map) return null;
  if (map instanceof Map) return Object.fromEntries(map);
  return map;
}

export function deserializePrevTxMap(obj) {
  if (!obj) return new Map();
  if (obj instanceof Map) return obj;
  return new Map(Object.entries(obj));
}
