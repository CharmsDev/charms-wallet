// UTXO Calculations - Fee calculations and utility functions
import { hasOrdinals } from './ordinals';
import { hasRunes, isRuneUtxo } from './runes';
import { isCharmUtxo, isPotentialCharm } from './charms';

export class UTXOCalculations {
    /**
     * SINGLE SOURCE OF TRUTH: Determines if a UTXO is spendable
     * @param {Object} utxo - The UTXO to check
     * @param {Array} charms - Array of charm objects
     * @param {Set} lockedUtxos - Set of locked UTXO IDs (optional)
     * @param {Object} transactionData - Optional transaction data for ordinals/runes detection
     * @returns {boolean} - True if UTXO is spendable
     */
    isUtxoSpendable(utxo, charms = [], lockedUtxos = null, transactionData = null) {
        const utxoId = `${utxo.txid}:${utxo.vout}`;

        // TMP Check if it's a potential charm (1000 sats)
        if (isPotentialCharm(utxo)) {
            return false;
        }
        
        // Check for ordinals/inscriptions if transaction data is available
        if (transactionData && hasOrdinals(transactionData, utxo.vout)) {
            return false;
        }
        
        // Check for runes (both with transaction data and heuristic for 546 sat UTXOs)
        if (isRuneUtxo(utxo, transactionData)) {
            return false;
        }
        
        // Check if locked
        if (lockedUtxos && lockedUtxos.has(utxoId)) {
            return false;
        }
        
        // Check if unconfirmed
        const isUnconfirmed = !utxo.status?.confirmed || (utxo.confirmations && utxo.confirmations < 1);
        if (isUnconfirmed) {
            return false;
        }
        
        // Check if it's a charm UTXO
        if (isCharmUtxo(utxo, charms)) {
            return false;
        }
                
        return true;
    }
    // Calculate fee for a transaction with standard inputs
    calculateFee(inputCount, outputCount, feeRate = 1) {
        // Size estimation: Taproot inputs (57 bytes) + outputs (34 bytes) + overhead (10 bytes)
        const estimatedSize = (inputCount * 57) + (outputCount * 34) + 10;
        return Math.ceil(estimatedSize * feeRate);
    }

    // Calculate fee for a transaction with mixed input types
    calculateMixedFee(utxos, outputCount, feeRate = 1) {
        const inputSize = utxos.reduce((sum, utxo) => {
            // P2PKH (148 bytes) vs Taproot (57 bytes)
            const inputType = utxo.scriptPubKey?.startsWith('76a9') ? 148 : 57;
            return sum + inputType;
        }, 0);

        const estimatedSize = inputSize + (outputCount * 34) + 10;
        return Math.ceil(estimatedSize * feeRate);
    }

    // Convert satoshis to BTC
    satoshisToBtc(satoshis) {
        return satoshis / 100000000;
    }

    // Convert BTC to satoshis
    btcToSatoshis(btc) {
        return Math.floor(btc * 100000000);
    }

    // Format satoshis as BTC string with 8 decimal places
    formatSats(satoshis) {
        return this.satoshisToBtc(satoshis).toFixed(8);
    }

    // Calculate total balance from UTXO map
    calculateTotalBalance(utxoMap) {
        let total = 0;

        Object.values(utxoMap).forEach(utxos => {
            utxos.forEach(utxo => {
                total += utxo.value;
            });
        });

        return total;
    }

    // Calculate spendable balance using the centralized spendability check
    calculateSpendableBalance(utxoMap, charms = [], lockedUtxos = null, transactionDataMap = null) {
        let total = 0;
        let totalUtxos = 0;
        let excludedUtxos = 0;
        const processedUtxos = new Set();

        Object.values(utxoMap).forEach(utxos => {
            utxos.forEach(utxo => {
                const utxoId = `${utxo.txid}:${utxo.vout}`;
                
                // Skip if already processed (avoid duplicates)
                if (processedUtxos.has(utxoId)) {
                    return;
                }
                processedUtxos.add(utxoId);
                totalUtxos++;
                
                // Get transaction data for ordinals/runes checking if available
                const transactionData = transactionDataMap ? transactionDataMap[utxo.txid] : null;
                
                // Use centralized spendability check
                if (this.isUtxoSpendable(utxo, charms, lockedUtxos, transactionData)) {
                    total += utxo.value;
                } else {
                    excludedUtxos++;
                }
            });
        });

        return total;
    }

    // Get list of spendable UTXOs using the centralized spendability check
    getSpendableUtxos(utxoMap, charms = [], lockedUtxos = null, transactionDataMap = null) {
        const spendableUtxos = [];
        const processedUtxos = new Set();

        Object.values(utxoMap).forEach(utxos => {
            utxos.forEach(utxo => {
                const utxoId = `${utxo.txid}:${utxo.vout}`;
                
                // Skip if already processed (avoid duplicates)
                if (processedUtxos.has(utxoId)) {
                    return;
                }
                processedUtxos.add(utxoId);
                
                // Get transaction data for ordinals/runes checking if available
                const transactionData = transactionDataMap ? transactionDataMap[utxo.txid] : null;
                
                // Use centralized spendability check
                if (this.isUtxoSpendable(utxo, charms, lockedUtxos, transactionData)) {
                    spendableUtxos.push(utxo);
                }
            });
        });

        return spendableUtxos;
    }

    // Find UTXOs by transaction ID
    findUtxosByTxid(utxoMap, txid) {
        const matchingUtxos = [];

        Object.entries(utxoMap).forEach(([address, utxos]) => {
            utxos.forEach(utxo => {
                if (utxo.txid === txid) {
                    matchingUtxos.push({
                        ...utxo,
                        address
                    });
                }
            });
        });

        return matchingUtxos;
    }
}

export const utxoCalculations = new UTXOCalculations();
export default utxoCalculations;
