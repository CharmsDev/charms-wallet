/**
 * Shared constants for the charm-transfer pipeline.
 * Single source of truth for URLs, dust amounts, and limits.
 */

export const SPELL_VERSION = 10;
export const CHARM_DUST = 546;          // sats — relay-safe P2TR dust
export const DEFAULT_FEE_RATE = 5;      // sat/vB
export const MAX_CHARM_INPUTS = 16;     // prover limit
export const MIN_FUNDING_SATS = 1000;   // minimum usable funding UTXO

// ── API URLs ─────────────────────────────────────────────────────────────────

export const EXPLORER_API =
  import.meta.env.VITE_EXPLORER_WALLET_API_URL || 'https://charms-explorer-api.fly.dev';

export const PROVER_URL_MAINNET =
  import.meta.env.VITE_PROVER_MAINNET_URL || 'https://v10.charms.dev/spells/prove';

export const PROVER_URL_TESTNET =
  import.meta.env.VITE_PROVER_TESTNET4_URL || 'https://prove-t4.charms.dev';

export const MEMPOOL_MAINNET = 'https://mempool.space/api';
export const MEMPOOL_TESTNET = 'https://mempool.space/testnet4/api';

export function getMempoolBase(network) {
  return network === 'mainnet' ? MEMPOOL_MAINNET : MEMPOOL_TESTNET;
}

export function getProverUrl(network) {
  return network === 'mainnet' ? PROVER_URL_MAINNET : PROVER_URL_TESTNET;
}

export function getExplorerNetworkParam(network) {
  return network === 'mainnet' ? 'mainnet' : 'testnet4';
}
