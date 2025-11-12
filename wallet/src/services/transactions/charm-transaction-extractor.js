/**
 * Charm Transaction Extractor
 * Extracts charm token information from transactions using charms-js
 */

import { extractAndVerifySpell } from 'charms-js';
import { bitcoinApiRouter } from '../shared/bitcoin-api-router';
import charmsExplorerAPI, { getBroTokenAppId } from '../charms/charms-explorer-api';

// BRO Token hardcoded fallback (when API is not available)
const BRO_TOKEN_FALLBACK = {
    name: 'Bro',
    ticker: '$BRO',
    image: 'https://bro.charms.dev/assets/bro-token-DsXLIv23.jpg',
    decimals: 8
};

/**
 * Extract charm token data from a transaction
 * @param {string} txid - Transaction ID
 * @param {string} network - Network (mainnet or testnet4)
 * @param {Array} myAddresses - Array of wallet addresses
 * @returns {Promise<Object|null>} Charm token data or null
 */
export async function extractCharmTokenData(txid, network, myAddresses = []) {
    try {
        console.log(`[CharmExtractor] Processing tx: ${txid}`);
        
        // Get transaction hex
        const txHex = await bitcoinApiRouter.getTransactionHex(txid, network);
        if (!txHex) {
            console.log(`[CharmExtractor] No tx hex found for ${txid}`);
            return null;
        }

        // Extract and verify spell using charms-js
        const spellResult = await extractAndVerifySpell(txHex, network);
        
        console.log(`[CharmExtractor] extractAndVerifySpell result:`, {
            success: spellResult.success,
            charmsCount: spellResult.charms?.length || 0
        });
        
        if (!spellResult.success || !spellResult.charms || spellResult.charms.length === 0) {
            console.log(`[CharmExtractor] No charms found in tx ${txid}`);
            return null;
        }

        // Get the first charm (usually there's only one per transaction)
        const charm = spellResult.charms[0];
        
        console.log(`[CharmExtractor] Charm data:`, {
            appId: charm.appId || charm.app_id,
            amount: charm.amount,
            outputs: charm.outputs?.length || 0
        });
        
        // Extract app ID
        const appId = charm.appId || charm.app_id;
        if (!appId) {
            console.log(`[CharmExtractor] No appId found in charm`);
            return null;
        }
        
        console.log(`[CharmExtractor] AppId: ${appId}`);

        // Get token metadata
        let tokenName = 'Unknown Token';
        let tokenTicker = 'TOKEN';
        let tokenImage = null;
        
        // Check if it's BRO token (use hardcoded fallback)
        const broAppId = getBroTokenAppId();
        const isBroToken = appId === broAppId;
        
        console.log(`[CharmExtractor] Token check:`, {
            appId,
            broAppId,
            isBroToken,
            match: appId === broAppId
        });
        
        if (isBroToken) {
            tokenName = BRO_TOKEN_FALLBACK.name;
            tokenTicker = BRO_TOKEN_FALLBACK.ticker;
            tokenImage = BRO_TOKEN_FALLBACK.image;
            console.log(`[CharmExtractor] Using BRO fallback data`);
        } else {
            console.log(`[CharmExtractor] Not BRO token, trying API...`);
            // Try to get metadata from Charms Explorer API for other tokens
            try {
                const metadata = await charmsExplorerAPI.getTokenMetadata(appId);
                if (metadata) {
                    tokenName = metadata.name || tokenName;
                    tokenTicker = metadata.ticker || tokenTicker;
                    tokenImage = metadata.image || null;
                    console.log(`[CharmExtractor] Got metadata from API:`, metadata);
                }
            } catch (error) {
                console.log(`[CharmExtractor] API failed, using defaults`);
                // Silent fail - use defaults for unknown tokens
            }
        }

        // Extract token amount from outputs (in satoshis, need to divide by 100,000,000)
        let tokenAmountSats = 0;
        const myAddressSet = new Set(myAddresses.map(addr => addr.address || addr));
        
        console.log(`[CharmExtractor] My addresses count: ${myAddressSet.size}`);
        
        if (charm.outputs && Array.isArray(charm.outputs)) {
            console.log(`[CharmExtractor] Processing ${charm.outputs.length} outputs`);
            // Sum amounts from outputs that belong to our addresses
            charm.outputs.forEach((output, idx) => {
                const isMyAddress = output.address && myAddressSet.has(output.address);
                console.log(`[CharmExtractor] Output ${idx}:`, {
                    address: output.address,
                    amount: output.amount,
                    isMine: isMyAddress
                });
                if (isMyAddress) {
                    tokenAmountSats += output.amount || 0;
                }
            });
        } else if (charm.amount !== undefined) {
            // Fallback to charm.amount if outputs not available
            tokenAmountSats = charm.amount;
            console.log(`[CharmExtractor] Using charm.amount fallback: ${tokenAmountSats}`);
        }
        
        console.log(`[CharmExtractor] Total amount in sats: ${tokenAmountSats}`);
        
        // Convert from satoshis to token units (divide by 100,000,000)
        const tokenAmount = tokenAmountSats / 100000000;
        
        console.log(`[CharmExtractor] Token amount after division: ${tokenAmount}`);

        const result = {
            appId,
            tokenName,
            tokenTicker,
            tokenImage,
            tokenAmount, // Already converted to token units
            tokenAmountSats, // Keep raw satoshi amount for reference
            charmData: charm // Store full charm data for reference
        };
        
        console.log(`[CharmExtractor] Final result:`, {
            appId,
            tokenName,
            tokenTicker,
            tokenAmount,
            tokenAmountSats
        });
        
        return result;
    } catch (error) {
        console.error('[CharmTransactionExtractor] Error extracting charm data:', error);
        return null;
    }
}

/**
 * Extract charm token data for multiple transactions
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
        
        if (onProgress) {
            onProgress(i + 1, transactions.length);
        }
        
        try {
            const charmData = await extractCharmTokenData(tx.txid, network, myAddresses);
            if (charmData) {
                results.set(tx.txid, charmData);
            }
        } catch (error) {
            // Continue with next transaction
            console.error(`[CharmTransactionExtractor] Error processing tx ${tx.txid}:`, error);
        }
    }
    
    return results;
}
