/**
 * Beam Resume — finds and resumes interrupted beams from localStorage.
 */

import { findIncompleteBeams } from '../core/persistence';
import { BEAM_PHASE } from '../core/types';

// Phases that can be resumed (have enough saved state to continue)
const RESUMABLE = new Set([
  BEAM_PHASE.WAITING_DEST_CONFIRM,  // placeholder created, waiting confirmation
  BEAM_PHASE.BUILDING_SPELL,        // placeholder confirmed, need to prove
  BEAM_PHASE.SIGNING_SOURCE,        // proof done, need to sign
  BEAM_PHASE.BROADCASTING_SOURCE,   // signed, need to broadcast
  BEAM_PHASE.WAITING_FINALITY,      // broadcast done, waiting 6 blocks
  BEAM_PHASE.CLAIMING_DEST,         // finality reached, need to claim
]);

/**
 * Find beams that can be resumed.
 * @returns {Array<{ id, state, resumeFrom }>}
 */
export function getResumableBeams() {
  return findIncompleteBeams()
    .filter(({ state }) => RESUMABLE.has(state.phase))
    .map(({ id, state }) => ({ id, state, resumeFrom: state.phase }));
}

/**
 * Get human-readable description of where a beam was interrupted.
 */
export function getResumeDescription(phase) {
  switch (phase) {
    case BEAM_PHASE.WAITING_DEST_CONFIRM: return 'Placeholder created, waiting for Cardano confirmation';
    case BEAM_PHASE.BUILDING_SPELL:       return 'Placeholder confirmed, ready to prove';
    case BEAM_PHASE.SIGNING_SOURCE:       return 'Proof generated, ready to sign';
    case BEAM_PHASE.BROADCASTING_SOURCE:  return 'Signed, ready to broadcast';
    case BEAM_PHASE.WAITING_FINALITY:     return 'Broadcast done, waiting for Bitcoin finality';
    case BEAM_PHASE.CLAIMING_DEST:        return 'Finality reached, ready to claim on Cardano';
    default: return 'Unknown state';
  }
}
