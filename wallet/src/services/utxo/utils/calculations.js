// UTXO Calculations - Fee calculations and utility functions
import { hasOrdinals } from './ordinals';
import { hasRunes, isRuneUtxo } from './runes';
import { isCharmUtxo, isPotentialCharm } from './charms';
import { calculateFee, calculateMixedFee as calculateMixedFeeUtil } from '@/services/wallet/utils/fee';
import { isSpent as isUtxoReserved } from '@/services/utxo-reservations';

/**
 * Classify a UTXO into one of three states for the UI:
 *   - 'reserved'  → currently used by an in-flight operation (beam, transfer, etc.)
 *   - 'protected' → unspendable as plain BTC (charm-bearing, ≤1000 sats dust, ordinal, rune)
 *   - null        → spendable
 *
 * 'reserved' takes priority over 'protected' so the user always sees
 * the most actionable label.
 */
export function getUtxoStatus(utxo, charms = [], transactionData = null) {
    if (!utxo) return null;
    if (isUtxoReserved('bitcoin', utxo.txid, utxo.vout)) return 'reserved';
    if (utxo.hasCharms === true) return 'protected';
    if (isPotentialCharm(utxo)) return 'protected';
    if (transactionData && hasOrdinals(transactionData, utxo.vout)) return 'protected';
    if (isRuneUtxo(utxo, transactionData)) return 'protected';
    if (isCharmUtxo(utxo, charms)) return 'protected';
    return null;
}

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
        
        // Reserved UTXOs: ≤ 1000 sats (charm dust, ordinals, runes)
        if (isPotentialCharm(utxo)) {
            return false;
        }

        if (transactionData && hasOrdinals(transactionData, utxo.vout)) {
            return false;
        }

        if (isRuneUtxo(utxo, transactionData)) {
            return false;
        }

        if (isCharmUtxo(utxo, charms)) {
            return false;
        }
        
        // Check if UTXO is locked
        if (lockedUtxos && lockedUtxos.has(utxoId)) {
            return false;
        }
        
        return true;
    }
    // Calculate fee for a transaction with standard inputs
    calculateFee(inputCount, outputCount, feeRate = 1) {
        return calculateFee(inputCount, outputCount, feeRate);
    }

    // Calculate fee for a transaction with mixed input types
    calculateMixedFee(utxos, outputCount, feeRate = 1) {
        return calculateMixedFeeUtil(utxos, outputCount, feeRate);
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

    // Calculate both spendable and pending balances in a single pass
    calculateBalances(utxoMap, charms = [], lockedUtxos = null, transactionDataMap = null) {
        let spendable = 0;
        let pending = 0;
        let nonSpendable = 0;
        let utxoCount = 0;
        let charmCount = 0;
        let ordinalCount = 0;
        let runeCount = 0;
        const processedUtxos = new Set();

        Object.entries(utxoMap).forEach(([address, utxos]) => {
            
            utxos.forEach(utxo => {
                const utxoId = `${utxo.txid}:${utxo.vout}`;

                // Deduplicate UTXOs across addresses
                if (processedUtxos.has(utxoId)) {
                    return;
                }
                processedUtxos.add(utxoId);
                utxoCount++;

                const transactionData = transactionDataMap ? transactionDataMap[utxo.txid] : null;
                const isUnconfirmed = !utxo.status?.confirmed || (utxo.confirmations && utxo.confirmations < 1);

                // Exclusion checks shared with spendability
                if (isPotentialCharm(utxo)) {
                    nonSpendable += utxo.value;
                    return;
                }
                if (transactionData && hasOrdinals(transactionData, utxo.vout)) {
                    ordinalCount++;
                    nonSpendable += utxo.value;
                    return;
                }
                if (isRuneUtxo(utxo, transactionData)) {
                    runeCount++;
                    nonSpendable += utxo.value;
                    return;
                }
                if (lockedUtxos && lockedUtxos.has(utxoId)) {
                    nonSpendable += utxo.value;
                    return;
                }
                if (isCharmUtxo(utxo, charms)) {
                    charmCount++;
                    nonSpendable += utxo.value;
                    return;
                }

                if (isUnconfirmed) {
                    pending += utxo.value;
                } else {
                    spendable += utxo.value;
                }
            });
        });

        return { 
            spendable, 
            pending, 
            nonSpendable,
            utxoCount,
            charmCount,
            ordinalCount,
            runeCount
        };
    }

    // Get list of spendable UTXOs using the centralized spendability check
    getSpendableUtxos(utxoMap, charms = [], lockedUtxos = null, transactionDataMap = null) {
        const spendableUtxos = {};
        const processedUtxos = new Set();

        Object.entries(utxoMap).forEach(([address, utxos]) => {
            utxos.forEach(utxo => {
                const utxoId = `${utxo.txid}:${utxo.vout}`;
                
                // Skip if already processed (avoid duplicates)
                if (processedUtxos.has(utxoId)) {
                    return;
                }
                processedUtxos.add(utxoId);

                const transactionData = transactionDataMap ? transactionDataMap[utxo.txid] : null;
                
                if (this.isUtxoSpendable(utxo, charms, lockedUtxos, transactionData)) {
                    if (!spendableUtxos[address]) {
                        spendableUtxos[address] = [];
                    }
                    spendableUtxos[address].push(utxo);
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
