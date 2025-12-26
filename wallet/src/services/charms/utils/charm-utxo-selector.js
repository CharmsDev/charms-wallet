/**
 * Charm UTXO Selector
 * Selects charm UTXOs to reach a target amount, similar to Bitcoin UTXO selection
 */

import { getCharmUtxoAmount } from './charm-utils';

// [RJJ-16] - Temporary 16 UTXO limitation due to Prover constraints
const MAX_INPUT_UTXOS = 16;

export class CharmUtxoSelector {
    /**
     * Get sorted UTXOs for an appId (largest first)
     * @private
     */
    _getSortedUtxos(charmUtxos, appId) {
        return charmUtxos
            .filter(utxo => utxo.appId === appId)
            .sort((a, b) => getCharmUtxoAmount(b) - getCharmUtxoAmount(a));
    }

    /**
     * Select charm UTXOs to reach target amount
     * @param {Array} charmUtxos - Array of charm UTXOs from charmsStore
     * @param {string} appId - App ID to filter by
     * @param {number} amountNeeded - Amount needed in smallest units
     * @returns {Object} { selectedUtxos, totalAmount, change, hasExactAmount }
     */
    selectCharmUtxosForAmount(charmUtxos, appId, amountNeeded) {
        const sortedUtxos = this._getSortedUtxos(charmUtxos, appId);

        if (sortedUtxos.length === 0) {
            throw new Error(`No UTXOs found for appId: ${appId}`);
        }

        const selectedUtxos = [];
        let totalAmount = 0;

        // [RJJ-16] - Temporary 16 UTXO limitation: Greedy selection limited to MAX_INPUT_UTXOS
        for (const utxo of sortedUtxos) {
            if (totalAmount >= amountNeeded || selectedUtxos.length >= MAX_INPUT_UTXOS) {
                break;
            }
            selectedUtxos.push(utxo);
            totalAmount += getCharmUtxoAmount(utxo);
        }

        if (totalAmount < amountNeeded) {
            // [RJJ-16] - Temporary: Max transferable limited by UTXO count
            const maxAmount = sortedUtxos.slice(0, MAX_INPUT_UTXOS)
                .reduce((sum, u) => sum + getCharmUtxoAmount(u), 0);
            throw new Error(
                `Insufficient balance. Need ${amountNeeded}, max with ${MAX_INPUT_UTXOS} UTXOs: ${maxAmount}`
            );
        }

        return {
            selectedUtxos,
            totalAmount,
            change: totalAmount - amountNeeded,
            hasExactAmount: totalAmount === amountNeeded
        };
    }

    /**
     * Get amount from a charm UTXO
     * @param {Object} utxo - Charm UTXO object
     * @returns {number} Amount in smallest units
     */
    getUtxoAmount(utxo) {
        return getCharmUtxoAmount(utxo);
    }

    /**
     * Check if we have enough balance for a transfer
     * @param {Array} charmUtxos - Array of charm UTXOs
     * @param {string} appId - App ID to check
     * @param {number} amountNeeded - Amount needed
     * @returns {boolean} True if we have enough balance
     */
    hasEnoughBalance(charmUtxos, appId, amountNeeded) {
        const matchingUtxos = charmUtxos.filter(utxo => utxo.appId === appId);
        const totalBalance = matchingUtxos.reduce(
            (sum, utxo) => sum + getCharmUtxoAmount(utxo),
            0
        );
        return totalBalance >= amountNeeded;
    }

    /**
     * Get total balance for an appId
     * @param {Array} charmUtxos - Array of charm UTXOs
     * @param {string} appId - App ID to check
     * @returns {number} Total balance
     */
    getTotalBalance(charmUtxos, appId) {
        const matchingUtxos = charmUtxos.filter(utxo => utxo.appId === appId);
        return matchingUtxos.reduce(
            (sum, utxo) => sum + getCharmUtxoAmount(utxo),
            0
        );
    }

    /**
     * [RJJ-16] - Temporary 16 UTXO limitation
     * Get maximum transferable amount considering the UTXO input limit
     * @param {Array} charmUtxos - Array of charm UTXOs
     * @param {string} appId - App ID to filter by
     * @returns {Object} { maxAmount, utxoCount, isLimited, totalBalance, maxUtxos }
     */
    getMaxTransferableAmount(charmUtxos, appId) {
        const sortedUtxos = this._getSortedUtxos(charmUtxos, appId);
        
        if (sortedUtxos.length === 0) {
            return { maxAmount: 0, utxoCount: 0, isLimited: false, totalBalance: 0, maxUtxos: MAX_INPUT_UTXOS };
        }

        const totalBalance = sortedUtxos.reduce((sum, u) => sum + getCharmUtxoAmount(u), 0);
        const limitedUtxos = sortedUtxos.slice(0, MAX_INPUT_UTXOS);
        const maxAmount = limitedUtxos.reduce((sum, u) => sum + getCharmUtxoAmount(u), 0);

        return {
            maxAmount,
            utxoCount: limitedUtxos.length,
            isLimited: sortedUtxos.length > MAX_INPUT_UTXOS,
            totalBalance,
            maxUtxos: MAX_INPUT_UTXOS
        };
    }
}

// Export singleton instance
export const charmUtxoSelector = new CharmUtxoSelector();
export default charmUtxoSelector;
