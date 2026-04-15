// Beam-out (BTC side)
export { buildBeamSpell } from './builder';
export { normalizeBeamSpell } from './normalizer';
export { buildProverPayload, submitToProver } from './payload';

// Claim (Cardano side)
export { buildClaimSpell } from './claim-builder';
export { normalizeClaimSpell } from './claim-normalizer';
export { buildClaimPayload, submitClaimToProver } from './claim-payload';
