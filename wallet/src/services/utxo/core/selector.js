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

        // Filter out locked UTXOs and any UTXO that contains a Charm
        const candidateUtxos = availableUtxos.filter(utxo => {
            const isLocked = this.lockedUtxos.has(`${utxo.txid}:${utxo.vout}`);
            const utxoId = `${utxo.txid}:${utxo.vout}`;
            const isCharm = charmUtxoIds.has(utxoId);
            
            if (isCharm) {
                console.log(`🚫 CHARM UTXO EXCLUDED: ${utxoId} (${utxo.value} sats)`);
            }
            
            return !isLocked && !isCharm;
        });

        console.log(`📊 UTXO Selection Summary:
        - Total available UTXOs: ${availableUtxos.length}
        - Charm UTXOs found: ${charmUtxoIds.size}
        - Locked UTXOs: ${this.lockedUtxos.size}
        - Candidate UTXOs after filtering: ${candidateUtxos.length}`);
        
        if (charmUtxoIds.size > 0) {
            console.log(`🔒 Charm UTXO IDs being excluded:`, Array.from(charmUtxoIds));
        }

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

        for (const utxo of sortedUtxos) {
            if (totalSelected >= targetAmount) {
                break;
            }

            const utxoKey = `${utxo.txid}:${utxo.vout}`;

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

                if (isUnspent) {
                    selectedUtxos.push(utxo);
                    totalSelected += utxo.value;
                } else {
                    // Immediately delete spent UTXO from storage/state; no blacklisting
                    await utxoService.removeUtxo(utxo.txid, utxo.vout);
                    if (updateStateCallback) {
                        try { await updateStateCallback([{ txid: utxo.txid, vout: utxo.vout }], {}); } catch {}
                    }
                }
            } catch (error) {
                // On verification failure, do not blacklist; keep UTXO to avoid false negatives
                // Proceed without selecting it in this pass
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
            return !isLocked && !isCharm;
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
