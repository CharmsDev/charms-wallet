/**
 * Beam service — public API.
 *
 * Import from here for clean access to beam functionality.
 * Internal module structure:
 *
 *   beam/
 *   ├── core/           # Types, crypto, persistence (network-agnostic)
 *   ├── spells/          # Spell builder, normalizer, prover payload
 *   ├── chains/
 *   │   ├── bitcoin/     # BTC finality, fee fetching
 *   │   └── cardano/     # Blockfrost API, placeholder, confirmation
 *   └── processor/       # Orchestrator, resume handler
 */

// Core
export { BEAM_PHASE, BEAM_DIRECTION, PHASE_LABELS, isActivePhase } from './core/types';
export { utxoIdHash } from './core/crypto';

// Processor
export { executeBeamOut } from './processor/executor';
export { getResumableBeams } from './processor/resume';

// Spells (for advanced usage / debugging)
export { buildBeamSpell } from './spells/builder';
export { normalizeBeamSpell } from './spells/normalizer';
