// Runes Detection Utility - Handles Bitcoin runes detection
import { tryDecodeRunestone, isRunestone } from '@magiceden-oss/runestone-lib';

/**
 * Check if a transaction contains runes
 * @param {Object} transactionData - Raw transaction data
 * @returns {boolean} - True if transaction contains runes
 */
export function hasRunes(transactionData) {
    try {
        // Try to decode runestone from transaction
        const artifact = tryDecodeRunestone(transactionData);
        
        // Check if it's a valid runestone (not a cenotaph)
        if (isRunestone(artifact)) {
            return true;
        }
        
        return false;
    } catch (error) {
        // If parsing fails, assume no runes to avoid false positives
        return false;
    }
}

/**
 * Check if a UTXO contains runes based on common runes characteristics
 * @param {Object} utxo - The UTXO to check
 * @param {Object} transactionData - Optional transaction data for verification
 * @returns {boolean} - True if UTXO likely contains runes
 */
export function isRuneUtxo(utxo, transactionData = null) {
    // Runes are typically stored in 546 sat UTXOs (dust limit)
    if (utxo.value === 546) {
        // If we have transaction data, verify it contains a runestone
        if (transactionData) {
            return hasRunes(transactionData);
        }
        
        // Without transaction data, assume 546 sat UTXOs are runes
        // This is a heuristic - 546 sats is the dust limit and commonly used for runes
        return true;
    }
    
    return false;
}

/**
 * Get detailed information about runes in a transaction
 * @param {Object} transactionData - Raw transaction data
 * @returns {Object|null} - Runestone object if found, null otherwise
 */
export function getRunesInfo(transactionData) {
    try {
        // Try to decode runestone from transaction
        const artifact = tryDecodeRunestone(transactionData);
        
        // Check if it's a valid runestone (not a cenotaph)
        if (isRunestone(artifact)) {
            return artifact;
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Check if a transaction is a rune etching (creating new runes)
 * @param {Object} transactionData - Raw transaction data
 * @returns {boolean} - True if transaction is etching runes
 */
export function isRuneEtching(transactionData) {
    try {
        const artifact = tryDecodeRunestone(transactionData);
        
        if (isRunestone(artifact)) {
            // Check if runestone has etching field
            return artifact.etching !== undefined && artifact.etching !== null;
        }
        
        return false;
    } catch (error) {
        return false;
    }
}

/**
 * Check if a transaction is a rune mint
 * @param {Object} transactionData - Raw transaction data
 * @returns {boolean} - True if transaction is minting runes
 */
export function isRuneMint(transactionData) {
    try {
        const artifact = tryDecodeRunestone(transactionData);
        
        if (isRunestone(artifact)) {
            // Check if runestone has mint field
            return artifact.mint !== undefined && artifact.mint !== null;
        }
        
        return false;
    } catch (error) {
        return false;
    }
}

/**
 * Filter UTXOs to exclude runes
 * @param {Array} utxos - Array of UTXOs to filter
 * @param {Object} transactionDataMap - Optional map of transaction data by txid
 * @returns {Array} - Filtered UTXOs without runes
 */
export function filterOutRunes(utxos, transactionDataMap = null) {
    return utxos.filter(utxo => {
        const transactionData = transactionDataMap ? transactionDataMap[utxo.txid] : null;
        return !isRuneUtxo(utxo, transactionData);
    });
}
