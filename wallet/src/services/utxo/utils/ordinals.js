// Ordinals Detection Utility - Handles Bitcoin ordinals/inscriptions detection
import { parseWitness } from 'micro-ordinals';

/**
 * Check if a transaction output contains ordinals/inscriptions
 * @param {Object} transactionData - Raw transaction data
 * @param {number} outputIndex - Output index to check
 * @returns {boolean} - True if output contains ordinals
 */
export function hasOrdinals(transactionData, outputIndex) {
    try {
        // Check if transaction has witness data (required for ordinals)
        if (!transactionData.vin || !Array.isArray(transactionData.vin)) {
            return false;
        }
        
        // Look for inscriptions in witness data of inputs
        for (const input of transactionData.vin) {
            if (input.txinwitness && Array.isArray(input.txinwitness)) {
                // Convert hex witness to bytes for parsing
                const witnessBytes = input.txinwitness.map(hex => {
                    // Remove '0x' prefix if present and convert hex to Uint8Array
                    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
                    const bytes = new Uint8Array(cleanHex.length / 2);
                    for (let i = 0; i < cleanHex.length; i += 2) {
                        bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
                    }
                    return bytes;
                });
                
                // Try to parse inscriptions from witness
                const inscriptions = parseWitness(witnessBytes);
                if (inscriptions && inscriptions.length > 0) {
                    return true;
                }
            }
        }
        
        return false;
    } catch (error) {
        // If parsing fails, assume no ordinals to avoid false positives
        return false;
    }
}

/**
 * Get detailed information about ordinals in a transaction
 * @param {Object} transactionData - Raw transaction data
 * @returns {Array} - Array of inscription objects found
 */
export function getOrdinalsInfo(transactionData) {
    try {
        const inscriptions = [];
        
        if (!transactionData.vin || !Array.isArray(transactionData.vin)) {
            return inscriptions;
        }
        
        // Look for inscriptions in witness data of inputs
        for (const input of transactionData.vin) {
            if (input.txinwitness && Array.isArray(input.txinwitness)) {
                // Convert hex witness to bytes for parsing
                const witnessBytes = input.txinwitness.map(hex => {
                    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
                    const bytes = new Uint8Array(cleanHex.length / 2);
                    for (let i = 0; i < cleanHex.length; i += 2) {
                        bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
                    }
                    return bytes;
                });
                
                // Try to parse inscriptions from witness
                const parsedInscriptions = parseWitness(witnessBytes);
                if (parsedInscriptions && parsedInscriptions.length > 0) {
                    inscriptions.push(...parsedInscriptions);
                }
            }
        }
        
        return inscriptions;
    } catch (error) {
        return [];
    }
}
