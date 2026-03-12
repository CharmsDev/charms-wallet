/**
 * charm-transfer — Public API (v10)
 *
 * Usage:
 *   import { proveCharmTransfer, signAndBroadcastTransfer } from '@/services/charm-transfer';
 */

export { proveCharmTransfer, signAndBroadcastTransfer } from './executor.js';
export { broadcastTx } from './broadcaster.js';
export { buildTransferSpell } from './spell-builder.js';
export {
    SPELL_VERSION,
    CHARM_DUST,
    DEFAULT_FEE_RATE,
    MAX_CHARM_INPUTS,
    MIN_FUNDING_SATS,
} from './constants.js';
