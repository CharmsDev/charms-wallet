// UTXO Selection Utilities for transaction input selection

import { calculateMixedFee } from './fee';

// Select UTXOs using a simple greedy algorithm
export function selectUtxosGreedy(utxoMap, amountBtc, feeRate = 1) {
    const amountSats = Math.floor(amountBtc * 100000000);
    const allUtxos = [];

    // Flatten UTXOs from all addresses
    Object.values(utxoMap).forEach(utxos => {
        allUtxos.push(...utxos);
    });

    // Sort by value (largest first to minimize inputs)
    allUtxos.sort((a, b) => b.value - a.value);

    // Add UTXOs until target amount is reached
    const selectedUtxos = [];
    let selectedAmount = 0;

    for (const utxo of allUtxos) {
        selectedUtxos.push(utxo);
        selectedAmount += utxo.value;

        // Calculate fee based on current selection
        const estimatedFee = calculateMixedFee(selectedUtxos, 2, feeRate);

        // Check if selected amount covers target plus fee
        if (selectedAmount >= amountSats + estimatedFee) {
            // Calculate change amount
            const change = selectedAmount - amountSats - estimatedFee;

            // Skip if change is dust (less than 546 sats)
            if (change > 0 && change < 546) {
                // Continue to next UTXO to see if we can find a better fit
                continue;
            }

            // Selection complete with valid change amount
            return selectedUtxos;
        }
    }

    // Return selected UTXOs even if insufficient
    return selectedAmount >= amountSats ? selectedUtxos : [];
}

// Select UTXOs using branch and bound algorithm to minimize waste
export function selectUtxosBranchAndBound(utxoMap, amountBtc, feeRate = 1) {
    // Currently uses greedy algorithm as fallback
    return selectUtxosGreedy(utxoMap, amountBtc, feeRate);
}

// Main entry point for UTXO selection that chooses appropriate algorithm
export function selectUtxos(utxoMap, amountBtc, feeRate = 1) {
    // Algorithm selection based on transaction size
    const amountSats = Math.floor(amountBtc * 100000000);

    if (amountSats < 100000) { // Small transactions (< 0.001 BTC)
        return selectUtxosGreedy(utxoMap, amountBtc, feeRate);
    } else {
        return selectUtxosBranchAndBound(utxoMap, amountBtc, feeRate);
    }
}

export default {
    selectUtxos,
    selectUtxosGreedy,
    selectUtxosBranchAndBound
};
