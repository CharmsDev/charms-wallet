/**
 * Charm Transaction Extractor
 * Extracts charm token information from transactions via Charms Explorer API.
 * No charms-js dependency — uses indexed data from the Explorer.
 */

import { explorerWalletService } from '../shared/explorer-wallet-service';

// Known token metadata (mirrors explorer-wallet-sync.js)
const KNOWN_TOKENS = {
    't/3d7fe7e4cea6121947af73d70e5119bebd8aa5b7edfe74bfaf6e779a1847bd9b/c975d4e0c292fb95efbda5c13312d6ac1d8b5aeff7f0f1e5578645a2da70ff5f': {
        name: 'Bro',
        ticker: '$BRO',
        image: 'https://bro.charms.dev/assets/bro-token-DsXLIv23.jpg',
        decimals: 8,
    },
};

/**
 * Extract charm token data from a transaction via Explorer API.
 * @param {string} txid - Transaction ID
 * @param {string} network - Network (mainnet or testnet4)
 * @param {Array} myAddresses - Array of wallet addresses (used to filter amounts)
 * @returns {Promise<Object|null>} Charm token data or null
 */
export async function extractCharmTokenData(txid, network, myAddresses = []) {
    try {
        const data = await explorerWalletService.getCharmsByTxid(txid, network);

        // API may return array directly or { charms: [...] }
        const charmsArray = Array.isArray(data) ? data : (data?.charms || data?.data || []);
        if (!charmsArray || charmsArray.length === 0) return null;

        // Use first charm entry for metadata
        const charm = charmsArray[0];
        const appId = charm.app_id || charm.appId;
        if (!appId) return null;

        const known = KNOWN_TOKENS[appId];
        const decimals = known?.decimals || 0;

        // Sum amounts for wallet addresses
        const myAddressSet = new Set(
            myAddresses.map(a => (typeof a === 'string' ? a : a?.address)).filter(Boolean)
        );
        let tokenAmountSats = 0;
        for (const c of charmsArray) {
            const addr = c.address || c.output_address;
            if (!myAddressSet.size || myAddressSet.has(addr)) {
                tokenAmountSats += c.amount || 0;
            }
        }

        const tokenAmount = decimals > 0 ? tokenAmountSats / Math.pow(10, decimals) : tokenAmountSats;

        return {
            appId,
            tokenName: known?.name || charm.symbol || charm.name || 'Unknown Token',
            tokenTicker: known?.ticker || charm.symbol || 'TOKEN',
            tokenImage: known?.image || charm.image || null,
            tokenAmount,
            tokenAmountSats,
        };
    } catch (error) {
        console.error('[CharmTransactionExtractor] Error extracting charm data:', error);
        return null;
    }
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
