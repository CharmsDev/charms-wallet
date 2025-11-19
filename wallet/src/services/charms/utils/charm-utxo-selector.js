/**
 * Charm UTXO Selector
 * Selects charm UTXOs to reach a target amount, similar to Bitcoin UTXO selection
 */

import { getCharmUtxoAmount } from './charm-utils';

export class CharmUtxoSelector {
    /**
     * Select charm UTXOs to reach target amount
     * @param {Array} charmUtxos - Array of charm UTXOs from charmsStore
     * @param {string} appId - App ID to filter by
     * @param {number} amountNeeded - Amount needed in smallest units
     * @returns {Object} { selectedUtxos, totalAmount, change, hasExactAmount }
     */
    selectCharmUtxosForAmount(charmUtxos, appId, amountNeeded) {
        // Filter only UTXOs with matching appId
        const matchingUtxos = charmUtxos.filter(utxo => utxo.appId === appId);

        if (matchingUtxos.length === 0) {
            throw new Error(`No UTXOs found for appId: ${appId}`);
        }

        // Sort by amount (largest first) for greedy selection
        const sortedUtxos = [...matchingUtxos].sort((a, b) => {
            const amountA = getCharmUtxoAmount(a);
            const amountB = getCharmUtxoAmount(b);
            return amountB - amountA;
        });

        const selectedUtxos = [];
        let totalAmount = 0;

        // Greedy selection: pick largest UTXOs until we reach target
        for (const utxo of sortedUtxos) {
            if (totalAmount >= amountNeeded) {
                break;
            }

            selectedUtxos.push(utxo);
            totalAmount += getCharmUtxoAmount(utxo);
        }

        // Check if we have enough
        if (totalAmount < amountNeeded) {
            throw new Error(
                `Insufficient charm balance. Need ${amountNeeded}, only have ${totalAmount}`
            );
        }

        const change = totalAmount - amountNeeded;
        const hasExactAmount = change === 0;

        return {
            selectedUtxos,
            totalAmount,
            change,
            hasExactAmount
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
}

// Export singleton instance
export const charmUtxoSelector = new CharmUtxoSelector();
export default charmUtxoSelector;
