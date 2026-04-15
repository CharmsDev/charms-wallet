/**
 * Beam core types and constants.
 * Network-agnostic — no chain-specific logic here.
 */

// ── Beam phases (linear progression) ────────────────────────────────────────

export const BEAM_PHASE = {
  PENDING_CONFIRM:    'pending_confirm',
  CREATING_PLACEHOLDER: 'creating_placeholder',
  WAITING_DEST_CONFIRM: 'waiting_dest_confirm',
  BUILDING_SPELL:     'building_spell',
  PROVING:            'proving',
  SIGNING_SOURCE:     'signing_source',
  BROADCASTING_SOURCE: 'broadcasting_source',
  WAITING_FINALITY:   'waiting_finality',
  CLAIMING_DEST:      'claiming_dest',
  COMPLETE:           'complete',
  ERROR:              'error',
};

// ── Beam direction ──────────────────────────────────────────────────────────

export const BEAM_DIRECTION = {
  BTC_TO_ADA: 'btc_to_ada',
  ADA_TO_BTC: 'ada_to_btc',
};

// ── Phase labels (human-readable) ───────────────────────────────────────────

export const PHASE_LABELS = {
  [BEAM_PHASE.PENDING_CONFIRM]:      'Waiting for confirmation',
  [BEAM_PHASE.CREATING_PLACEHOLDER]: 'Creating placeholder UTXO',
  [BEAM_PHASE.WAITING_DEST_CONFIRM]: 'Waiting for destination chain confirmation',
  [BEAM_PHASE.BUILDING_SPELL]:       'Building beam spell',
  [BEAM_PHASE.PROVING]:              'Generating ZK proof',
  [BEAM_PHASE.SIGNING_SOURCE]:       'Signing source transaction',
  [BEAM_PHASE.BROADCASTING_SOURCE]:  'Broadcasting to source chain',
  [BEAM_PHASE.WAITING_FINALITY]:     'Waiting for finality',
  [BEAM_PHASE.CLAIMING_DEST]:        'Claiming on destination chain',
  [BEAM_PHASE.COMPLETE]:             'Complete',
  [BEAM_PHASE.ERROR]:                'Error',
};

// ── Active phase check ──────────────────────────────────────────────────────

const TERMINAL_PHASES = new Set([
  BEAM_PHASE.COMPLETE,
  BEAM_PHASE.ERROR,
  BEAM_PHASE.PENDING_CONFIRM,
]);

export function isActivePhase(phase) {
  return !TERMINAL_PHASES.has(phase);
}
