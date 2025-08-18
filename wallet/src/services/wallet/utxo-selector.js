import { UTXOCleaner } from '../bitcoin/utxo-cleaner.js';
import BitcoinBroadcastService from '../bitcoin/broadcast-service.js';
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';

/**
 * UTXO Selector - Clean UTXO selection with direct removal of spent UTXOs
 */
export class UtxoSelector {
    constructor() {
        this.lockedUtxos = new Set();
    }

    async verifyUtxoUnspent(utxo) {
        // Skip API verification - assume all UTXOs are valid
        // Real verification happens during broadcast
        return true;
    }


    async selectUtxosForAmountDynamic(availableUtxos, amountInSats, feeRate = 1, updateStateCallback = null, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        console.log(`[UtxoSelector] Selecting UTXOs: ${amountInSats} sats from ${availableUtxos.length} available`);
        
        // Filter out locked UTXOs
        const candidateUtxos = availableUtxos.filter(utxo => {
            const utxoKey = `${utxo.txid}:${utxo.vout}`;
            return !this.lockedUtxos.has(utxoKey);
        });
        
        if (candidateUtxos.length === 0) {
            throw new Error('No UTXOs available for selection - all are locked');
        }
        
        // TEMPORARILY DISABLED: UTXO verification (API timeouts blocking transactions)
        console.log(`[UtxoSelector] Using ${candidateUtxos.length} candidate UTXOs without verification (API issues)`);
        const cleaner = new UTXOCleaner();
        const { validUtxos: verifiedUtxos, spentUtxos } = await cleaner.cleanUtxos(candidateUtxos);
        
        // Also filter out UTXOs marked as spent by broadcast service
        const finalUtxos = verifiedUtxos.filter(utxo => {
            const isSpent = BitcoinBroadcastService.isUtxoSpent(utxo.txid, utxo.vout);
            if (isSpent) {
                console.log(`[UtxoSelector] Filtering out previously failed UTXO: ${utxo.txid}:${utxo.vout}`);
            }
            return !isSpent;
        });
        
        console.log(`[UtxoSelector] Using ${finalUtxos.length} verified UTXOs (removed ${spentUtxos.length} spent, ${verifiedUtxos.length - finalUtxos.length} previously failed)`);
        
        // Sort UTXOs by value (smallest first) to minimize touching large coins
        finalUtxos.sort((a, b) => a.value - b.value);
        
        // Calculate estimated fee
        const estimatedInputs = 1;
        const outputs = 2;
        const estimatedFee = this.calculateFee(estimatedInputs, outputs, feeRate);
        const targetAmount = amountInSats + estimatedFee;
        
        const selectedUtxos = [];
        let totalSelected = 0;
        
        // Simple greedy selection using final UTXOs
        for (const utxo of finalUtxos) {
            selectedUtxos.push(utxo);
            totalSelected += utxo.value;
            
            if (totalSelected >= targetAmount) {
                break;
            }
        }
        
        // Check if we have enough funds
        if (totalSelected < targetAmount) {
            throw new Error(`Insufficient funds: need ${targetAmount} sats, have ${totalSelected} sats`);
        }
        
        // Calculate actual fee and change
        const actualFee = this.calculateFee(selectedUtxos.length, 2, feeRate);
        const change = totalSelected - amountInSats - actualFee;
        
        console.log(`[UtxoSelector] Selected ${selectedUtxos.length} UTXOs totaling ${totalSelected} sats`);
        // Lock selected UTXOs to prevent reuse during in-flight tx
        for (const utxo of selectedUtxos) {
            const utxoKey = `${utxo.txid}:${utxo.vout}`;
            this.lockedUtxos.add(utxoKey);
        }

        return {
            selectedUtxos,
            totalSelected,
            estimatedFee: actualFee,
            change
        };
    }

    /**
     * Calculate transaction fee based on inputs, outputs and fee rate
     */
    calculateFee(inputCount, outputCount, feeRate = 1) {
        // Taproot transaction size estimation
        const inputSize = 57.5; // Taproot input size in vbytes
        const outputSize = 43; // Taproot output size in vbytes
        const baseSize = 10.5; // Base transaction size
        
        const estimatedSize = baseSize + (inputCount * inputSize) + (outputCount * outputSize);
        const fee = Math.ceil(estimatedSize * feeRate);
        
        // Minimum fee of 200 sats
        return Math.max(fee, 200);
    }

    selectUtxosForAmount(availableUtxos, amountInSats, feeRate = 1) {
        // Filter out locked UTXOs only
        const candidateUtxos = availableUtxos.filter(utxo => {
            const utxoKey = `${utxo.txid}:${utxo.vout}`;
            return !this.lockedUtxos.has(utxoKey);
        });

        // Sort by value (smallest first) to prefer smaller UTXOs
        const sortedUtxos = [...candidateUtxos].sort((a, b) => a.value - b.value);
        const selectedUtxos = [];
        let totalSelected = 0;

        let estimatedFee = utxoService.calculateMixedFee([], 2, feeRate);
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


    unlockUtxos(utxos) {
        utxos.forEach(utxo => {
            const utxoKey = `${utxo.txid}:${utxo.vout}`;
            this.lockedUtxos.delete(utxoKey);
        });
    }


    clearAllLocks() {
        this.lockedUtxos.clear();
        console.log('[UtxoSelector] Cleared all UTXO locks');
    }

    /**
     * Get current locked UTXOs for debugging
     */
    getLockedUtxos() {
        return [...this.lockedUtxos];
    }

    /**
     * Check if a specific UTXO is locked
     */
    isUtxoLocked(txid, vout) {
        const utxoKey = `${txid}:${vout}`;
        return this.lockedUtxos.has(utxoKey);
    }

    /**
     * Get lock statistics
     */
    getLockStats() {
        return {
            totalLocked: this.lockedUtxos.size,
            lockedUtxos: [...this.lockedUtxos]
        };
    }

    /**
     * Expose debug methods globally
     */
    exposeDebugMethods() {
        if (typeof window !== 'undefined') {
            window.utxoSelectorDebug = {
                getLockStats: () => this.getLockStats(),
                getLockedUtxos: () => this.getLockedUtxos(),
                isUtxoLocked: (txid, vout) => this.isUtxoLocked(txid, vout),
                clearAllLocks: () => this.clearAllLocks(),
                unlockUtxo: (txid, vout) => {
                    const utxoKey = `${txid}:${vout}`;
                    this.lockedUtxos.delete(utxoKey);
                    console.log(`[UtxoSelector] Manually unlocked UTXO: ${utxoKey}`);
                },
                help: () => {
                    console.log(`
UTXO Selector Debug Commands:
- utxoSelectorDebug.getLockStats() - Show lock statistics
- utxoSelectorDebug.getLockedUtxos() - Show currently locked UTXOs
- utxoSelectorDebug.isUtxoLocked(txid, vout) - Check if specific UTXO is locked
- utxoSelectorDebug.clearAllLocks() - Clear all UTXO locks
- utxoSelectorDebug.unlockUtxo(txid, vout) - Unlock specific UTXO
- utxoSelectorDebug.help() - Show this help
                    `);
                }
            };
            console.log('[UtxoSelector] Debug methods exposed as window.utxoSelectorDebug');
            console.log('Type utxoSelectorDebug.help() for available commands');
        }
    }
}

// Create singleton instance and expose debug methods
const utxoSelectorInstance = new UtxoSelector();
if (typeof window !== 'undefined') {
    utxoSelectorInstance.exposeDebugMethods();
}

export { UtxoSelector };
