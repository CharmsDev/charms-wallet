/**
 * Storage Keys — Single Source of Truth
 *
 * Hierarchical key schema for chrome.storage.local / localStorage.
 * Shared by wallet app, extension popup, background.js, and approve-sign.
 *
 * Format:
 *   Global keys:        wallet:<property>
 *   Per-chain keys:     wallet:<blockchain>:<network>:<dataType>
 *   Extension-only:     ext:<property>
 *
 * IMPORTANT: Every piece of code that reads/writes storage MUST use these
 * helpers. Never hardcode key strings elsewhere.
 */

// ─── Separator ───────────────────────────────────────────────────────
const SEP = ':';

// ─── Global keys (no blockchain/network) ─────────────────────────────
export const GLOBAL_KEYS = {
  SEED_PHRASE:        `wallet${SEP}seed_phrase`,
  ACTIVE_BLOCKCHAIN:  `wallet${SEP}active_blockchain`,
  ACTIVE_NETWORK:     `wallet${SEP}active_network`,
  BALANCE:            `wallet${SEP}balance`,
};

// ─── Data-type suffixes for per-chain keys ───────────────────────────
export const DATA_TYPES = {
  ADDRESSES:    'addresses',
  UTXOS:        'utxos',
  TRANSACTIONS: 'transactions',
  CHARMS:       'charms',
  INFO:         'info',
};

// ─── Extension-only ephemeral keys ───────────────────────────────────
export const EXT_KEYS = {
  CONNECTED_SITES:      `ext${SEP}connected_sites`,
  PENDING_CONNECTION:   `ext${SEP}pending_connection`,
  CONNECTION_RESPONSE:  `ext${SEP}connection_response`,
  PENDING_SIGN:         `ext${SEP}pending_sign`,
  SIGN_RESPONSE:        `ext${SEP}sign_response`,
};

// ─── Builders ────────────────────────────────────────────────────────

/**
 * Build a per-chain storage key.
 * @param {string} blockchain - e.g. "bitcoin", "cardano"
 * @param {string} network    - e.g. "mainnet", "testnet4", "preprod"
 * @param {string} dataType   - one of DATA_TYPES values
 * @returns {string} e.g. "wallet:bitcoin:mainnet:addresses"
 */
export function chainKey(blockchain, network, dataType) {
  return `wallet${SEP}${blockchain}${SEP}${network}${SEP}${dataType}`;
}

/**
 * Build the addresses key for a given chain+network.
 */
export function addressesKey(blockchain, network) {
  return chainKey(blockchain, network, DATA_TYPES.ADDRESSES);
}

/**
 * Build the UTXOs key for a given chain+network.
 */
export function utxosKey(blockchain, network) {
  return chainKey(blockchain, network, DATA_TYPES.UTXOS);
}

/**
 * Build the transactions key for a given chain+network.
 */
export function transactionsKey(blockchain, network) {
  return chainKey(blockchain, network, DATA_TYPES.TRANSACTIONS);
}

/**
 * Build the charms key for a given chain+network.
 */
export function charmsKey(blockchain, network) {
  return chainKey(blockchain, network, DATA_TYPES.CHARMS);
}

/**
 * Build the wallet info key for a given chain+network.
 */
export function infoKey(blockchain, network) {
  return chainKey(blockchain, network, DATA_TYPES.INFO);
}

/**
 * Get the prefix for all keys of a given chain+network.
 * Useful for listing/clearing: keys.filter(k => k.startsWith(prefix))
 * @returns {string} e.g. "wallet:bitcoin:mainnet:"
 */
export function chainPrefix(blockchain, network) {
  return `wallet${SEP}${blockchain}${SEP}${network}${SEP}`;
}

/**
 * Check if a key belongs to wallet data (global or per-chain).
 */
export function isWalletKey(key) {
  return key.startsWith(`wallet${SEP}`);
}

/**
 * Check if a key belongs to extension ephemeral data.
 */
export function isExtKey(key) {
  return key.startsWith(`ext${SEP}`);
}
