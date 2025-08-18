// UTXO Selector - Handles UTXO selection algorithms and verification
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';

export class UTXOSelector {
    constructor() {
        this.spentUtxosBlacklist = new Set();
        this.lockedUtxos = new Set();
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

    async selectUtxosForAmountDynamic(availableUtxos, amountInSats, feeRate = 1, verifier = null, updateStateCallback = null, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        console.log('[UTXOSelector] Starting dynamic UTXO selection with verification');

        const candidateUtxos = availableUtxos.filter(utxo => {
            const utxoKey = `${utxo.txid}:${utxo.vout}`;
            const isInLocalList = this.spentUtxosBlacklist.has(utxoKey);

            if (isInLocalList) {
                console.log(`[UTXOSelector] Filtering out UTXO ${utxoKey}: already processed as spent`);
                return false;
            }
            return true;
        });

        console.log(`[UTXOSelector] Filtered from ${availableUtxos.length} to ${candidateUtxos.length} candidate UTXOs`);

        if (candidateUtxos.length === 0) {
            throw new Error('No valid UTXOs available. Please refresh your wallet.');
        }

        const sortedUtxos = [...candidateUtxos].sort((a, b) => b.value - a.value);
        const selectedUtxos = [];
        let totalSelected = 0;

        let estimatedFee = this.calculateMixedFee([], 2, feeRate);
        const minimumFee = 200;
        if (estimatedFee < minimumFee) {
            estimatedFee = minimumFee;
        }

        const targetAmount = amountInSats + estimatedFee;

        console.log(`[UTXOSelector] Starting verification of ${sortedUtxos.length} candidate UTXOs`);
        console.log(`[UTXOSelector] Target amount: ${targetAmount} sats (${amountInSats} + ${estimatedFee} fee)`);

        for (const utxo of sortedUtxos) {
            if (totalSelected >= targetAmount) {
                console.log(`[UTXOSelector] Target amount reached: ${totalSelected} >= ${targetAmount}`);
                break;
            }

            const utxoKey = `${utxo.txid}:${utxo.vout}`;
            console.log(`[UTXOSelector] Verifying UTXO: ${utxoKey} (${utxo.value} sats)`);

            try {
                let isUnspent = true;

                if (verifier) {
                    isUnspent = await verifier.verifyAndUpdateUTXO(
                        utxo,
                        updateStateCallback,
                        blockchain,
                        network
                    );
                }

                console.log(`[UTXOSelector] Verification result for ${utxoKey}: ${isUnspent ? 'UNSPENT' : 'SPENT'}`);

                if (isUnspent) {
                    selectedUtxos.push(utxo);
                    totalSelected += utxo.value;
                    console.log(`[UTXOSelector] ✅ Selected UTXO ${utxoKey} (${utxo.value} sats) - Total: ${totalSelected} sats`);
                } else {
                    this.spentUtxosBlacklist.add(utxoKey);
                    console.log(`[UTXOSelector] ❌ UTXO ${utxoKey} is SPENT - added to blacklist, storage and state updated`);
                }
            } catch (error) {
                console.error(`[UTXOSelector] Error verifying UTXO ${utxoKey}:`, error);
                this.spentUtxosBlacklist.add(utxoKey);
                console.log(`[UTXOSelector] ⚠️ UTXO ${utxoKey} verification failed - added to blacklist`);
            }
        }

        if (totalSelected < targetAmount) {
            throw new Error(`Insufficient verified UTXOs. Need ${targetAmount} sats, only found ${totalSelected} sats in valid UTXOs.`);
        }

        return {
            selectedUtxos,
            totalSelected,
            estimatedFee,
            change: totalSelected - amountInSats - estimatedFee
        };
    }

    selectUtxosForAmount(availableUtxos, amountInSats, feeRate = 1) {
        const candidateUtxos = availableUtxos.filter(utxo => {
            const utxoKey = `${utxo.txid}:${utxo.vout}`;
            return !this.lockedUtxos.has(utxoKey) && !this.spentUtxosBlacklist.has(utxoKey);
        });

        const sortedUtxos = [...candidateUtxos].sort((a, b) => b.value - a.value);
        const selectedUtxos = [];
        let totalSelected = 0;

        let estimatedFee = this.calculateMixedFee([], 2, feeRate);
        const minimumFee = 200;
        if (estimatedFee < minimumFee) {
            estimatedFee = minimumFee;
        }

        const totalNeeded = amountInSats + estimatedFee;

        for (const utxo of sortedUtxos) {
            if (totalSelected >= totalNeeded) break;

            const utxoKey = `${utxo.txid}:${utxo.vout}`;
            this.lockedUtxos.add(utxoKey);
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
        const inputSize = utxos.reduce((sum, utxo) => {
            const inputType = utxo.scriptPubKey?.startsWith('76a9') ? 148 : 57;
            return sum + inputType;
        }, 0);

        const estimatedSize = inputSize + (outputCount * 34) + 10;
        return Math.ceil(estimatedSize * feeRate);
    }

    lockUtxos(utxos) {
        utxos.forEach(utxo => {
            const utxoKey = `${utxo.txid}:${utxo.vout}`;
            this.lockedUtxos.add(utxoKey);
        });
    }

    unlockUtxos(utxos) {
        utxos.forEach(utxo => {
            const utxoKey = `${utxo.txid}:${utxo.vout}`;
            this.lockedUtxos.delete(utxoKey);
        });
    }

    clearAllLocks() {
        this.lockedUtxos.clear();
        console.log('[UTXOSelector] Cleared all UTXO locks');
    }

    isUtxoLocked(txid, vout) {
        const utxoKey = `${txid}:${vout}`;
        return this.lockedUtxos.has(utxoKey);
    }

    getLockedUtxos() {
        return [...this.lockedUtxos];
    }

    getLockStats() {
        return {
            totalLocked: this.lockedUtxos.size,
            lockedUtxos: [...this.lockedUtxos],
            totalBlacklisted: this.spentUtxosBlacklist.size,
            blacklistedUtxos: [...this.spentUtxosBlacklist]
        };
    }
}

export const utxoSelector = new UTXOSelector();
export default utxoSelector;
