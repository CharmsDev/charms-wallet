/**
 * Charm Transaction Extractor
 *
 * Pulls charm token metadata from the indexed `/v1/transactions/{txid}`
 * endpoint, which inlines `charm.detected` + `assets[]` for any indexed tx
 * (returns `charm: null` for pure BTC — never 404s like the old
 * `/v1/charms/{txid}` it replaces).
 */

import { explorerWalletService } from '../shared/explorer-wallet-service';

// Known token overrides — image + decimals the indexer doesn't carry yet.
const KNOWN_TOKENS = {
    't/3d7fe7e4cea6121947af73d70e5119bebd8aa5b7edfe74bfaf6e779a1847bd9b/c975d4e0c292fb95efbda5c13312d6ac1d8b5aeff7f0f1e5578645a2da70ff5f': {
        name: 'Bro',
        ticker: '$BRO',
        image: 'https://bro.charms.dev/assets/bro-token-DsXLIv23.jpg',
        decimals: 8,
    },
};

/**
 * Extract charm token data for a transaction. Resolves to null when the tx
 * is not a charm (charm.detected !== true) so callers can short-circuit.
 *
 * @param {string} txid    Transaction ID
 * @param {string} network mainnet | testnet4
 * @param {Array}  _myAddresses unused — kept for backward signature compat;
 *                              the indexer aggregates per-tx amounts already.
 */
export async function extractCharmTokenData(txid, network, _myAddresses = []) {
    let data;
    try {
        data = await explorerWalletService.getIndexedTransaction(txid, network);
    } catch (error) {
        // 404 here = tx not indexed at all; rare. Other errors logged.
        if (error?.status !== 404) {
            console.warn('[CharmTransactionExtractor] tx lookup failed:', error?.message || error);
        }
        return null;
    }

    if (!data?.charm?.detected) return null;
    const assets = Array.isArray(data.assets) ? data.assets : [];
    if (!assets.length) return null;

    // Pick the first token-type asset (charm txs typically carry one token
    // app — multi-asset edge cases would need a richer caller).
    const asset = assets.find(a => a.app_id) || null;
    if (!asset) return null;

    const appId = asset.app_id;
    const known = KNOWN_TOKENS[appId];
    const decimals = known?.decimals || 0;
    const tokenAmountSats = asset.amount || 0;
    const tokenAmount = decimals > 0 ? tokenAmountSats / Math.pow(10, decimals) : tokenAmountSats;

    return {
        appId,
        tokenName: known?.name || asset.name || asset.symbol || 'Unknown Token',
        tokenTicker: known?.ticker || asset.symbol || 'TOKEN',
        tokenImage: known?.image || null,
        tokenAmount,
        tokenAmountSats,
    };
}

/**
 * Extract charm token data for multiple transactions.
 * @param {Array} transactions - Array of transaction objects with txid
 * @param {string} network - Network (mainnet or testnet4)
 * @param {Array} myAddresses - Array of wallet addresses
 * @param {Function} onProgress - Progress callback (current, total)
 * @returns {Promise<Map>} Map of txid -> charm token data
 */
export async function extractCharmTokenDataBatch(transactions, network, myAddresses = [], onProgress = null) {
    const results = new Map();

    for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];
        if (onProgress) onProgress(i + 1, transactions.length);

        try {
            const charmData = await extractCharmTokenData(tx.txid, network, myAddresses);
            if (charmData) {
                results.set(tx.txid, charmData);
            }
        } catch (error) {
            console.error(`[CharmTransactionExtractor] Error processing tx ${tx.txid}:`, error);
        }
    }

    return results;
}
