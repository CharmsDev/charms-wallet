// UTXO Selector - Handles UTXO selection algorithms and verification
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';
import { utxoService } from '@/services/utxo/utxo-service';
import { getCharms } from '@/services/storage';
import { utxoCalculations } from '@/services/utxo/utils/calculations';

export class UTXOSelector {
    constructor() {
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

    async selectUtxosForAmountDynamic(availableUtxos, amountInSats, feeRate = 1, verifier = null, updateStateCallback = null, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET, transactionDataMap = null) {
        // Get current charms to exclude their UTXOs
        const networkKey = network === 'mainnet' ? 'mainnet' : 'testnet4';
        const charms = await getCharms(blockchain, networkKey) || [];
        
        // Use centralized spendability check to filter UTXOs (including ordinals/runes detection)
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

        let estimatedFee = this.calculateMixedFee([], 2, feeRate);
        const minimumFee = 200;
        if (estimatedFee < minimumFee) {
            estimatedFee = minimumFee;
        }

        const targetAmount = amountInSats + estimatedFee;

        for (const utxo of sortedUtxos) {
            if (totalSelected >= targetAmount) {
                break;
            }

            // Skip UTXOs that are already locked
            const utxoKey = `${utxo.txid}:${utxo.vout}`;
            if (this.lockedUtxos.has(utxoKey)) {
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
        
        // Use centralized spendability check to filter UTXOs (including ordinals/runes detection)
        const candidateUtxos = availableUtxos.filter(utxo => {
            const transactionData = transactionDataMap ? transactionDataMap[utxo.txid] : null;
            return utxoCalculations.isUtxoSpendable(utxo, charms, this.lockedUtxos, transactionData);
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
            lockedUtxos: [...this.lockedUtxos]
        };
    }
}

export const utxoSelector = new UTXOSelector();
export default utxoSelector;
