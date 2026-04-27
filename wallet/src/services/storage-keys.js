/**
 * Storage Keys — Single Source of Truth (hierarchical, scalable schema).
 *
 * Layout:
 *
 *   wallet:meta:version              schema version (number; bump on shape change → triggers wipe)
 *   wallet:meta:created              ISO timestamp of first wallet setup
 *   wallet:seed_phrase               THE seed (sacred — preserved across wipes; never rename)
 *
 *   wallet:session:active_blockchain "bitcoin" | "cardano" | <future>
 *
 *   wallet:prefs:ui                  UI toggles, theme, etc.
 *
 *   wallet:chain:<bc>:active_network last selected network for the blockchain
 *   wallet:chain:<bc>:info           wallet info per blockchain
 *
 *   wallet:net:<bc>:<net>:addresses    derived addresses for this (chain, network)
 *   wallet:net:<bc>:<net>:utxos        utxo map by address
 *   wallet:net:<bc>:<net>:transactions tx history (array)
 *   wallet:net:<bc>:<net>:charms       BTC charms (chain-specific shape)
 *   wallet:net:<bc>:<net>:assets       Cardano CNTs (chain-specific shape)
 *   wallet:net:<bc>:<net>:asset_meta   Cardano per-asset metadata cache
 *   wallet:net:<bc>:<net>:balance      derived balance summary
 *   wallet:net:<bc>:<net>:sync_meta    watermarks (lastSyncBlock, ...)
 *
 *   wallet:asset:<appId>:metadata    cross-network token metadata (chain-agnostic appId)
 *   wallet:cache:<name>              cross-network caches
 *
 *   ext:<...>                        extension-only ephemeral keys
 *
 * Adding a new blockchain or network: write under `wallet:net:<bc>:<net>:<type>` —
 * no schema migration required. Adding a new data type: add it to DATA_TYPES.
 * Changing the shape of any existing data type: bump SCHEMA_VERSION in
 * storage-version.js → existing clients wipe and rehydrate from indexer.
 *
 * IMPORTANT: every reader/writer of storage MUST use these helpers.
 */

const SEP = ':';

// ─── Top-level namespaces ────────────────────────────────────────────
const NS = {
    WALLET:  'wallet',
    EXT:     'ext',
};

// ─── System / global keys (never under a specific blockchain) ────────
export const SYSTEM_KEYS = {
    // Schema version. Compared against CURRENT_VERSION at boot; mismatch
    // triggers a wipe of everything except the seed.
    VERSION:           `${NS.WALLET}${SEP}meta${SEP}version`,
    CREATED:           `${NS.WALLET}${SEP}meta${SEP}created`,

    // The seed phrase. THE one key wipes never delete. Do not rename
    // without a careful migration that preserves the value.
    SEED_PHRASE:       `${NS.WALLET}${SEP}seed_phrase`,

    // Session: which blockchain + network is currently active in the UI.
    // Kept under the legacy `wallet:active_*` paths because several
    // hot-path callsites read them as raw strings — moving would break
    // those without much benefit. Schema change is only for heavy data.
    ACTIVE_BLOCKCHAIN: `${NS.WALLET}${SEP}active_blockchain`,
    ACTIVE_NETWORK:    `${NS.WALLET}${SEP}active_network`,

    // UI preferences (toggles, theme, list filters).
    UI_PREFS:          `${NS.WALLET}${SEP}prefs${SEP}ui`,
};

// ─── Per-blockchain keys (one row per blockchain regardless of network) ──
export const chainActiveNetworkKey = (blockchain) =>
    `${NS.WALLET}${SEP}chain${SEP}${blockchain}${SEP}active_network`;

export const chainInfoKey = (blockchain) =>
    `${NS.WALLET}${SEP}chain${SEP}${blockchain}${SEP}info`;

// ─── Per (blockchain, network) data types ────────────────────────────
export const DATA_TYPES = {
    ADDRESSES:    'addresses',
    UTXOS:        'utxos',
    TRANSACTIONS: 'transactions',
    CHARMS:       'charms',       // BTC charm UTXOs
    ASSETS:       'assets',       // Cardano native assets (CNTs / proxies)
    ASSET_META:   'asset_meta',   // Cardano per-asset metadata cache
    BALANCE:      'balance',
    SYNC_META:    'sync_meta',
    INFO:         'info',
};

/**
 * Build a per-(chain, network) storage key.
 * Example: netKey('bitcoin', 'mainnet', 'utxos') → 'wallet:net:bitcoin:mainnet:utxos'
 */
export const netKey = (blockchain, network, dataType) =>
    `${NS.WALLET}${SEP}net${SEP}${blockchain}${SEP}${network}${SEP}${dataType}`;

/**
 * Prefix for all keys belonging to a single (chain, network) pair —
 * useful for bulk listing / clearing.
 */
export const netPrefix = (blockchain, network) =>
    `${NS.WALLET}${SEP}net${SEP}${blockchain}${SEP}${network}${SEP}`;

// ─── Cross-network asset metadata (token shape is chain-agnostic) ────
export const assetMetaKey = (appId) =>
    `${NS.WALLET}${SEP}asset${SEP}${appId}${SEP}metadata`;

// ─── Cross-network caches ────────────────────────────────────────────
export const cacheKey = (name) =>
    `${NS.WALLET}${SEP}cache${SEP}${name}`;

// ─── Extension-only ephemeral keys ───────────────────────────────────
export const EXT_KEYS = {
    CONNECTED_SITES:      `${NS.EXT}${SEP}connected_sites`,
    PENDING_CONNECTION:   `${NS.EXT}${SEP}pending_connection`,
    CONNECTION_RESPONSE:  `${NS.EXT}${SEP}connection_response`,
    PENDING_SIGN:         `${NS.EXT}${SEP}pending_sign`,
    SIGN_RESPONSE:        `${NS.EXT}${SEP}sign_response`,
};

// ─── Predicates ──────────────────────────────────────────────────────
export const isWalletKey = (key) => key.startsWith(`${NS.WALLET}${SEP}`);
export const isExtKey    = (key) => key.startsWith(`${NS.EXT}${SEP}`);
