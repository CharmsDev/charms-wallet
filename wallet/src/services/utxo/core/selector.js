// UTXO Selector - Handles UTXO selection algorithms and verification
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';
import { utxoService } from '@/services/utxo/utxo-service';
import { getCharms } from '@/services/storage';
import { utxoCalculations } from '../utils/calculations';
import { calculateMixedFee } from '@/services/wallet/utils/fee';
import { markSpent, release, isSpent, getSpentSet, clearChain } from '@/services/utxo-reservations';

export class UTXOSelector {
    constructor() {
        // Backed by services/utxo-reservations (chain='bitcoin').
        // The `lockedUtxos` getter returns a live snapshot so legacy code
        // that does `.has()` on it keeps working.
    }

    get lockedUtxos() {
        return getSpentSet('bitcoin');
    }

    selectUtxosGreedy(utxoMap, amountBtc, feeRate = 1) {
        const amountSats = Math.floor(amountBtc * 100000000);
        const allUtxos = [];

        Object.values(utxoMap).forEach(utxos => {
            allUtxos.push(...utxos);
        });

        allUtxos.sort((a, b) => b.value - a.value);

        const selectedUtxos = [];
        let selectedAmount = 0;

        for (const utxo of allUtxos) {
            selectedUtxos.push(utxo);
            selectedAmount += utxo.value;

            const estimatedFee = this.calculateMixedFee(selectedUtxos, 2, feeRate);

            if (selectedAmount >= amountSats + estimatedFee) {
                const change = selectedAmount - amountSats - estimatedFee;

                if (change > 0 && change < 546) {
                    continue;
                }

                return selectedUtxos;
            }
        }

        return selectedAmount >= amountSats ? selectedUtxos : [];
    }

    selectUtxos(utxoMap, amountBtc, feeRate = 1) {
        const amountSats = Math.floor(amountBtc * 100000000);

        if (amountSats < 100000) {
            return this.selectUtxosGreedy(utxoMap, amountBtc, feeRate);
        } else {
            return this.selectUtxosGreedy(utxoMap, amountBtc, feeRate);
        }
    }

    async selectUtxosForAmountDynamic(availableUtxos, amountInSats, feeRate = 1, verifier = null, updateStateCallback = null, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET, transactionDataMap = null) {
        // Get current charms to exclude their UTXOs
        const networkKey = network === 'mainnet' ? 'mainnet' : 'testnet4';
        const charms = await getCharms(blockchain, networkKey) || [];
        
        // CRITICAL: isUtxoSpendable filters out charms, ordinals, runes, and locked UTXOs - NEVER select reserved UTXOs
        const candidateUtxos = availableUtxos.filter(utxo => {
            const transactionData = transactionDataMap ? transactionDataMap[utxo.txid] : null;
            return utxoCalculations.isUtxoSpendable(utxo, charms, this.lockedUtxos, transactionData);
        });

        if (candidateUtxos.length === 0) {
            throw new Error('No valid UTXOs available. Wallet refresh required.');
        }

        const sortedUtxos = [...candidateUtxos].sort((a, b) => b.value - a.value);
        
        const selectedUtxos = [];
        let totalSelected = 0;

        // Start with estimated fee for 2 outputs (destination + change)
        let estimatedFee = this.calculateMixedFee([], 2, feeRate);

        const targetAmount = amountInSats + estimatedFee;

        for (const utxo of sortedUtxos) {
            if (totalSelected >= targetAmount) {
                break;
            }

            // Skip UTXOs that are already reserved
            if (isSpent('bitcoin', utxo.txid, utxo.vout)) {
                continue;
            }

            // Verify UTXO is still unspent if verifier is provided
            if (verifier) {
                try {
                    const isUnspent = await verifier.isUtxoSpent(utxo.txid, utxo.vout, network);
                    
                    if (!isUnspent) {
                        // UTXO is unspent
                    } else {
                        // Immediately delete spent UTXO from storage/state; no blacklisting
                        if (updateStateCallback) {
                            await updateStateCallback([utxo], {}, blockchain, network);
                        }
                        continue;
                    }
                } catch (error) {
                    // On verification failure, proceed without selecting
                }
            }

            selectedUtxos.push(utxo);
            totalSelected += utxo.value;
        }

        if (totalSelected < targetAmount) {
            throw new Error(`Insufficient verified UTXOs. Need ${targetAmount} sats, only found ${totalSelected} sats in valid UTXOs.`);
        }

        // Calculate change
        let change = totalSelected - amountInSats - estimatedFee;
        
        // Detect if this is a Max amount transaction (change < 200 sats indicates Max usage)
        const isMaxAmount = change < 200;
        // Check if this is a max amount transaction (amount + fee equals total spendable)
        const totalSpendable = sortedUtxos.reduce((sum, utxo) => sum + utxo.value, 0);
        const estimatedFeeForMax = this.calculateMixedFee(sortedUtxos, 1, feeRate); // Assume 1 output for max
        const maxPossible = totalSpendable - estimatedFeeForMax;
        const isMaxTransaction = Math.abs(amountInSats - maxPossible) <= 10; // Allow small tolerance
        
        
        if (isMaxTransaction) {
            // For max transactions, use all UTXOs and no change
            return {
                selectedUtxos: sortedUtxos,
                totalValue: totalSpendable,
                fee: estimatedFeeForMax,
                change: 0,
                isMaxTransaction: true
            };
        }

        return {
            selectedUtxos,
            totalSelected,
            estimatedFee,
            change
        };
    }

    async selectUtxosForAmount(availableUtxos, amountInSats, feeRate = 1, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET, transactionDataMap = null) {
        // Get current charms to exclude their UTXOs
        const networkKey = network === 'mainnet' ? 'mainnet' : 'testnet4';
        const charms = await getCharms(blockchain, networkKey) || [];
        
        // CRITICAL: isUtxoSpendable filters out charms, ordinals, runes, and locked UTXOs - NEVER select reserved UTXOs
        const candidateUtxos = availableUtxos.filter(utxo => {
            const transactionData = transactionDataMap ? transactionDataMap[utxo.txid] : null;
            return utxoCalculations.isUtxoSpendable(utxo, charms, this.lockedUtxos, transactionData);
        });

        const sortedUtxos = [...candidateUtxos].sort((a, b) => b.value - a.value);
        const selectedUtxos = [];
        let totalSelected = 0;

        // Calculate estimated fee for 2 outputs (destination + change)
        let estimatedFee = this.calculateMixedFee([], 2, feeRate);

        const totalNeeded = amountInSats + estimatedFee;

        for (const utxo of sortedUtxos) {
            if (totalSelected >= totalNeeded) break;

            markSpent('bitcoin', utxo.txid, utxo.vout);
            selectedUtxos.push(utxo);
            totalSelected += utxo.value;
        }

        const sufficientFunds = totalSelected >= totalNeeded;

        return {
            selectedUtxos,
            totalSelected,
            sufficientFunds,
            estimatedFee
        };
    }

    calculateMixedFee(utxos, outputCount, feeRate = 1) {
        return calculateMixedFee(utxos, outputCount, feeRate);
    }

    // ── Reservation API (delegates to utxo-reservations service) ─────────
    // Kept for backward compat with existing callsites
    // (BeamOperationsContext, utxoStore, useTransactionFlow).

    lockUtxos(utxos) {
        utxos.forEach(u => markSpent('bitcoin', u.txid, u.vout));
    }

    unlockUtxos(utxos) {
        utxos.forEach(u => release('bitcoin', u.txid, u.vout));
    }

    clearAllLocks() {
        clearChain('bitcoin');
    }

    isUtxoLocked(txid, vout) {
        return isSpent('bitcoin', txid, vout);
    }

    getLockedUtxos() {
        return [...getSpentSet('bitcoin')];
    }

    getLockStats() {
        const set = getSpentSet('bitcoin');
        return {
            totalLocked: set.size,
            lockedUtxos: [...set],
        };
    }
}

export const utxoSelector = new UTXOSelector();
export default utxoSelector;
