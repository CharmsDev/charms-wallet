/**
 * Lifecycle of a PendingEntry — pure state machine.
 *
 *   created ──broadcast──▶ broadcast ──mempool─seen──▶ mempool
 *                                │                       │
 *                                │                       ├──block─seen──▶ in-block ──confirmed─▶ confirmed
 *                                │                       │
 *                                │                       └──dropped──▶ dropped
 *                                │
 *                                └──fail──▶ failed
 *
 *   `failed` can also fire from `created` (e.g. user-locked wallet at
 *   sign time). `dropped` can only follow `mempool` — a tx the indexer
 *   has clearly forgotten.
 *
 * No timers here. Transitions only happen because something *justifies*
 * them — broadcast result, sync result, explicit failure. The hub
 * decides when to ask the indexer; this file just validates moves.
 */

export const STATE = Object.freeze({
  CREATED:   'created',
  BROADCAST: 'broadcast',
  MEMPOOL:   'mempool',
  IN_BLOCK:  'in-block',
  CONFIRMED: 'confirmed',
  FAILED:    'failed',
  DROPPED:   'dropped',
});

export const EVENT = Object.freeze({
  BROADCAST:    'broadcast',
  MEMPOOL_SEEN: 'mempool-seen',
  BLOCK_SEEN:   'block-seen',
  CONFIRM:      'confirm',
  FAIL:         'fail',
  DROP:         'drop',
});

const TERMINAL = new Set([STATE.CONFIRMED, STATE.FAILED, STATE.DROPPED]);

// Counts toward pendingOut / pendingIn / inFlight in the displayed
// balance. `created` is included because the user has committed to the
// op (UTXOs reserved) even before broadcast — they shouldn't see those
// sats as still spendable.
const LIVE = new Set([STATE.CREATED, STATE.BROADCAST, STATE.MEMPOOL, STATE.IN_BLOCK]);

export function isTerminal(state) { return TERMINAL.has(state); }
export function isLive(state)     { return LIVE.has(state); }

const TRANSITIONS = Object.freeze({
  [STATE.CREATED]: {
    [EVENT.BROADCAST]: STATE.BROADCAST,
    [EVENT.FAIL]:      STATE.FAILED,
  },
  [STATE.BROADCAST]: {
    [EVENT.MEMPOOL_SEEN]: STATE.MEMPOOL,
    [EVENT.BLOCK_SEEN]:   STATE.IN_BLOCK,  // some indexers skip mempool view
    [EVENT.FAIL]:         STATE.FAILED,
  },
  [STATE.MEMPOOL]: {
    [EVENT.BLOCK_SEEN]: STATE.IN_BLOCK,
    [EVENT.DROP]:       STATE.DROPPED,
    [EVENT.FAIL]:       STATE.FAILED,
  },
  [STATE.IN_BLOCK]: {
    [EVENT.CONFIRM]: STATE.CONFIRMED,
    // Block re-orgs are theoretically possible — caller can fail it.
    [EVENT.FAIL]:    STATE.FAILED,
  },
  [STATE.CONFIRMED]: {},
  [STATE.FAILED]:    {},
  [STATE.DROPPED]:   {},
});

export function nextState(current, event) {
  const allowed = TRANSITIONS[current];
  if (!allowed) throw new Error(`pending-state-machine: unknown state "${current}"`);
  const next = allowed[event];
  if (!next) {
    throw new Error(
      `pending-state-machine: illegal transition "${current}" --${event}-->`,
    );
  }
  return next;
}

export function canTransition(current, event) {
  return Boolean(TRANSITIONS[current] && TRANSITIONS[current][event]);
}
