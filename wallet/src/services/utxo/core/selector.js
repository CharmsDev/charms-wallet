// UTXO Selector - Handles UTXO selection algorithms and verification
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';
import { utxoService } from '@/services/utxo/utxo-service';
import { getCharms } from '@/services/storage';
import { utxoCalculations } from '../utils/calculations';
import { calculateMixedFee } from '@/services/wallet/utils/fee';
import { markSpent, release, isSpent, getSpentSet, clearChain, getActiveOperations } from '@/services/utxo-reservations';

export class UTXOSelector {
    constructor() {
        // Backed by services/utxo-reservations (chain='bitcoin').
        // The `lockedUtxos` getter returns a live snapshot so legacy code
        // that does `.has()` on it keeps working.
    }

    get lockedUtxos() {
        return getSpentSet('bitcoin');
    }

    selectUtxosGreedy(utxoMap, amountBtc, feeRate) {
        if (!feeRate || feeRate <= 0) {
            throw new Error('selectUtxosGreedy: feeRate is required (call getNetworkFeeRate first).');
        }
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

    selectUtxos(utxoMap, amountBtc, feeRate) {
        return this.selectUtxosGreedy(utxoMap, amountBtc, feeRate);
    }

    async selectUtxosForAmountDynamic(availableUtxos, amountInSats, feeRate, verifier = null, updateStateCallback = null, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET, transactionDataMap = null) {
        if (!feeRate || feeRate <= 0) {
            throw new Error('selectUtxosForAmountDynamic: feeRate is required (call getNetworkFeeRate first).');
        }
        // Get current charms to exclude their UTXOs
        const networkKey = network === 'mainnet' ? 'mainnet' : 'testnet4';
        const charms = await getCharms(blockchain, networkKey) || [];

        // CRITICAL: isUtxoSpendable filters out charms, ordinals, runes, and locked UTXOs - NEVER select reserved UTXOs
        const reservedSet = this.lockedUtxos;
        const candidateUtxos = availableUtxos.filter(utxo => {
            const transactionData = transactionDataMap ? transactionDataMap[utxo.txid] : null;
            return utxoCalculations.isUtxoSpendable(utxo, charms, reservedSet, transactionData);
        });

        if (candidateUtxos.length === 0) {
            // Distinguish "no UTXOs" from "all UTXOs reserved by an active op".
            // The latter is a much more useful message — names the holding
            // beam so the user knows to wait for it instead of refreshing.
            const reservedFromAvailable = availableUtxos.filter(u => reservedSet.has(`${u.txid}:${u.vout}`));
            if (reservedFromAvailable.length > 0) {
                const ops = getActiveOperations('bitcoin');
                const labels = ops.map(o => o.label).filter(Boolean);
                const opStr = labels.length ? `: ${[...new Set(labels)].join(', ')}` : '';
                throw new Error(
                    `${reservedFromAvailable.length} UTXO(s) are reserved by active operation${labels.length > 1 ? 's' : ''}${opStr}. ` +
                    `Wait for it to finish or fund a new UTXO before sending.`
                );
            }
            throw new Error('No valid UTXOs available. Wallet refresh required.');
        }

        const sortedUtxos = [...candidateUtxos].sort((a, b) => b.value - a.value);

        // Max short-circuit: if the caller is asking for an amount within
        // 10 sats of "all inputs minus a 1-output fee", treat as Max and
        // return a no-change selection BEFORE the regular loop runs.
        // The loop bootstraps with a 2-output fee assumption, so a true
        // Max amount would always trip the insufficient-funds throw below
        // even though a single-output tx fits perfectly. That mismatch is
        // exactly the "Need 405085 sats, only found 405000 sats" failure
        // surfaced from clicking the Max button.
        {
            const totalSpendable = sortedUtxos.reduce((sum, u) => sum + u.value, 0);
            const feeForMax = this.calculateMixedFee(sortedUtxos, 1, feeRate);
            const maxPossible = totalSpendable - feeForMax;
            if (Math.abs(amountInSats - maxPossible) <= 10) {
                return {
                    selectedUtxos: sortedUtxos,
                    totalSelected: totalSpendable,
                    estimatedFee: feeForMax,
                    change: 0,
                    sufficientFunds: true,
                    isMaxTransaction: true,
                };
            }
        }

        const selectedUtxos = [];
        let totalSelected = 0;
        // Bootstrap with one average input so the initial target is realistic;
        // each picked input may shift the fee, so we re-estimate inside the loop.
        let estimatedFee = this.calculateMixedFee([{ scriptPubKey: '5120' }], 2, feeRate);

        for (const utxo of sortedUtxos) {
            if (totalSelected >= amountInSats + estimatedFee) break;

            if (isSpent('bitcoin', utxo.txid, utxo.vout)) continue;

            if (verifier) {
                try {
                    const spent = await verifier.isUtxoSpent(utxo.txid, utxo.vout, network);
                    if (spent) {
                        if (updateStateCallback) {
                            await updateStateCallback([utxo], {}, blockchain, network);
                        }
                        continue;
                    }
                } catch { /* proceed without verification */ }
            }

            selectedUtxos.push(utxo);
            totalSelected += utxo.value;
            // Re-estimate fee with the actual input set so the next iteration
            // (and the final target) sees the real cost of what we've picked.
            estimatedFee = this.calculateMixedFee(selectedUtxos, 2, feeRate);
        }

        const targetAmount = amountInSats + estimatedFee;
        if (totalSelected < targetAmount) {
            // If reservations are taking enough sats to make the difference,
            // surface that to the user instead of an opaque shortfall.
            const reservedFromAvailable = availableUtxos.filter(u => reservedSet.has(`${u.txid}:${u.vout}`));
            const reservedSats = reservedFromAvailable.reduce((s, u) => s + (u.value || 0), 0);
            if (reservedSats > 0 && totalSelected + reservedSats >= targetAmount) {
                const ops = getActiveOperations('bitcoin');
                const labels = ops.map(o => o.label).filter(Boolean);
                const opStr = labels.length ? `: ${[...new Set(labels)].join(', ')}` : '';
                throw new Error(
                    `Insufficient spendable UTXOs. ${reservedSats.toLocaleString()} sats are reserved by active operation${labels.length > 1 ? 's' : ''}${opStr}. ` +
                    `Wait for it to finish or fund a new UTXO before sending.`
                );
            }
            throw new Error(`Insufficient verified UTXOs. Need ${targetAmount} sats, only found ${totalSelected} sats in valid UTXOs.`);
        }

        // Calculate change. The Max-amount case is already handled by the
        // short-circuit at the top of this function.
        const change = totalSelected - amountInSats - estimatedFee;

        return {
            selectedUtxos,
            totalSelected,
            estimatedFee,
            change
        };
    }

    async selectUtxosForAmount(availableUtxos, amountInSats, feeRate, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET, transactionDataMap = null) {
        if (!feeRate || feeRate <= 0) {
            throw new Error('selectUtxosForAmount: feeRate is required (call getNetworkFeeRate first).');
        }
        const networkKey = network === 'mainnet' ? 'mainnet' : 'testnet4';
        const charms = await getCharms(blockchain, networkKey) || [];
        const candidateUtxos = availableUtxos.filter(utxo => {
            const transactionData = transactionDataMap ? transactionDataMap[utxo.txid] : null;
            return utxoCalculations.isUtxoSpendable(utxo, charms, this.lockedUtxos, transactionData);
        });

        const sortedUtxos = [...candidateUtxos].sort((a, b) => b.value - a.value);
        const selectedUtxos = [];
        let totalSelected = 0;
        let estimatedFee = this.calculateMixedFee([{ scriptPubKey: '5120' }], 2, feeRate);

        for (const utxo of sortedUtxos) {
            if (totalSelected >= amountInSats + estimatedFee) break;
            markSpent('bitcoin', utxo.txid, utxo.vout);
            selectedUtxos.push(utxo);
            totalSelected += utxo.value;
            estimatedFee = this.calculateMixedFee(selectedUtxos, 2, feeRate);
        }

        return {
            selectedUtxos,
            totalSelected,
            sufficientFunds: totalSelected >= amountInSats + estimatedFee,
            estimatedFee,
        };
    }

    calculateMixedFee(utxos, outputCount, feeRate) {
        if (!feeRate || feeRate <= 0) {
            throw new Error('calculateMixedFee: feeRate is required (call getNetworkFeeRate first).');
        }
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
