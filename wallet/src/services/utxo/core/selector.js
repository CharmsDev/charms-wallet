// UTXO Selector - Handles UTXO selection algorithms and verification
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';
import { utxoService } from '@/services/utxo/utxo-service';
import { getCharms } from '@/services/storage';

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

    async selectUtxosForAmountDynamic(availableUtxos, amountInSats, feeRate = 1, verifier = null, updateStateCallback = null, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        // Get current charms to exclude their UTXOs
        const networkKey = network === 'mainnet' ? 'mainnet' : 'testnet';
        const charms = await getCharms(blockchain, networkKey) || [];
        
        // Create set of charm UTXO identifiers
        const charmUtxoIds = new Set();
        charms.forEach(charm => {
            if (charm.txid && charm.outputIndex !== undefined) {
                charmUtxoIds.add(`${charm.txid}:${charm.outputIndex}`);
            }
            // Also handle uniqueId format variations
            if (charm.uniqueId) {
                const uid = charm.uniqueId;
                if (/^[0-9a-fA-F]+:\d+$/.test(uid)) {
                    charmUtxoIds.add(uid);
                } else if (uid.includes('-')) {
                    const parts = uid.split('-');
                    if (parts.length >= 3) {
                        const txid = parts[0];
                        const vout = parts[parts.length - 1];
                        if (/^\d+$/.test(vout)) {
                            charmUtxoIds.add(`${txid}:${vout}`);
                        }
                    }
                }
            }
        });

        // Filter out locked UTXOs, any UTXO that contains a Charm, UTXOs with exactly 1000 sats, and unconfirmed UTXOs
        const candidateUtxos = availableUtxos.filter(utxo => {
            const isLocked = this.lockedUtxos.has(`${utxo.txid}:${utxo.vout}`);
            const utxoId = `${utxo.txid}:${utxo.vout}`;
            const isCharm = charmUtxoIds.has(utxoId);
            const is1000Sats = utxo.value === 1000;
            const isUnconfirmed = !utxo.status?.confirmed || (utxo.confirmations && utxo.confirmations < 1);
            
            if (isUnconfirmed) {
                console.log(`[UTXOSelector] Filtering unconfirmed UTXO: ${utxoId}, confirmed: ${utxo.status?.confirmed}, confirmations: ${utxo.confirmations}`);
            }
            
            return !isLocked && !isCharm && !is1000Sats && !isUnconfirmed;
        });

        
        if (charmUtxoIds.size > 0) {
        }

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
        
        if (isMaxAmount) {
            
            // For Max amount: recalculate fee with 1 output (no change)
            const feeForOneOutput = this.calculateMixedFee(selectedUtxos, 1, feeRate);
            
            const finalFee = Math.max(feeForOneOutput, 200); // Apply minimum fee
            
            if (finalFee === 200) {
            } else {
            }
            
            // Adjust amount to consume all selected UTXOs minus exact fee
            const adjustedAmount = totalSelected - finalFee;
            
            
            return {
                selectedUtxos,
                totalSelected,
                estimatedFee: finalFee,
                change: 0,
                adjustedAmount // Return the adjusted amount for Max transactions
            };
        }

        return {
            selectedUtxos,
            totalSelected,
            estimatedFee,
            change
        };
    }

    async selectUtxosForAmount(availableUtxos, amountInSats, feeRate = 1, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        // Get current charms to exclude their UTXOs
        const networkKey = network === 'mainnet' ? 'mainnet' : 'testnet';
        const charms = await getCharms(blockchain, networkKey) || [];
        
        // Create set of charm UTXO identifiers
        const charmUtxoIds = new Set();
        charms.forEach(charm => {
            if (charm.txid && charm.outputIndex !== undefined) {
                charmUtxoIds.add(`${charm.txid}:${charm.outputIndex}`);
            }
            // Also handle uniqueId format variations
            if (charm.uniqueId) {
                const uid = charm.uniqueId;
                if (/^[0-9a-fA-F]+:\d+$/.test(uid)) {
                    charmUtxoIds.add(uid);
                } else if (uid.includes('-')) {
                    const parts = uid.split('-');
                    if (parts.length >= 3) {
                        const txid = parts[0];
                        const vout = parts[parts.length - 1];
                        if (/^\d+$/.test(vout)) {
                            charmUtxoIds.add(`${txid}:${vout}`);
                        }
                    }
                }
            }
        });

        const candidateUtxos = availableUtxos.filter(utxo => {
            const utxoKey = `${utxo.txid}:${utxo.vout}`;
            const isLocked = this.lockedUtxos.has(utxoKey);
            const isCharm = charmUtxoIds.has(utxoKey);
            const is1000Sats = utxo.value === 1000;
            
            return !isLocked && !isCharm && !is1000Sats;
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
