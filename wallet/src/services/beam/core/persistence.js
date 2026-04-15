/**
 * Beam state persistence.
 * Saves/restores beam progress to localStorage so beams survive page reloads.
 * The ~70 min BTC finality wait makes this essential.
 */

const STORAGE_KEY = 'charms_beam_operations';

/**
 * Save a beam operation's progress.
 * @param {string} beamId
 * @param {object} state - { phase, direction, beamAmount, tokenAppId,
 *   placeholderTxid, placeholderVout, sourceTxid, claimTxid, ... }
 */
export function saveBeamState(beamId, state) {
  const all = loadAllBeamStates();
  all[beamId] = { ...state, updatedAt: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

/**
 * Load a single beam's state.
 * @param {string} beamId
 * @returns {object|null}
 */
export function loadBeamState(beamId) {
  const all = loadAllBeamStates();
  return all[beamId] || null;
}

/**
 * Load all saved beam states.
 * @returns {Record<string, object>}
 */
export function loadAllBeamStates() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Remove a completed/dismissed beam.
 * @param {string} beamId
 */
export function removeBeamState(beamId) {
  const all = loadAllBeamStates();
  delete all[beamId];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

/**
 * Find beams that were interrupted (not complete/error).
 * @returns {Array<{ id: string, state: object }>}
 */
export function findIncompleteBeams() {
  const all = loadAllBeamStates();
  return Object.entries(all)
    .filter(([, s]) => s.phase !== 'complete' && s.phase !== 'error')
    .map(([id, state]) => ({ id, state }));
}
