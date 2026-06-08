// utxo-manager.js - Enhanced UTXO management after Bitcoin transactions
import { getAddresses } from '@/services/storage';

/**
 * UTXO Manager Service
 * Handles UTXO state management after Bitcoin transactions
 */
class UTXOManager {
    
    /**
     * Process transaction completion and update UTXO state
     * @param {Object} transactionData - Transaction data from SendBitcoinDialog
     * @param {Function} updateAfterTransaction - UTXO store update function
     * @param {string} blockchain - Blockchain identifier
     * @param {string} network - Network identifier
     */
    async processTransactionCompletion(transactionData, updateAfterTransaction, blockchain, network) {
        try {
            
            // Prepare spent UTXOs for removal
            const spentUtxos = transactionData.utxos.map(utxo => ({
                txid: utxo.txid,
                vout: utxo.vout,
                address: utxo.address
            }));

            // Create potential new UTXOs from transaction outputs
            const newUtxos = await this.createNewUtxosFromTransaction(transactionData, blockchain, network);

            // Update UTXO store
            await updateAfterTransaction(spentUtxos, newUtxos, blockchain, network);
            
            return {
                success: true,
                spentUtxos: spentUtxos.length,
                newUtxos: Object.values(newUtxos).reduce((total, utxos) => total + utxos.length, 0)
            };

        } catch (error) {
            throw error;
        }
    }

    /**
     * Create new UTXO entries from transaction outputs
     * Note: These will be unconfirmed initially and should be marked as such
     */
    async createNewUtxosFromTransaction(transactionData, blockchain, network) {
        const newUtxos = {};

        try {
            // Get wallet addresses to identify change outputs
            const addresses = await getAddresses();
            const walletAddresses = new Set(addresses.map(addr => addr.address));

            // If we have transaction data with decoded outputs, process them
            if (transactionData.decodedTx && transactionData.decodedTx.outputs) {
                for (let vout = 0; vout < transactionData.decodedTx.outputs.length; vout++) {
                    const output = transactionData.decodedTx.outputs[vout];
                    
                    // Skip OP_RETURN outputs (value = 0)
                    if (output.value === 0) {
                        continue;
                    }

                    // Check if this output goes to one of our addresses
                    if (output.address && walletAddresses.has(output.address)) {
                        if (!newUtxos[output.address]) {
                            newUtxos[output.address] = [];
                        }

                        // Create new UTXO entry (unconfirmed)
                        newUtxos[output.address].push({
                            txid: transactionData.txid,
                            vout: vout,
                            value: output.value,
                            status: {
                                confirmed: false,
                                block_height: null,
                                block_hash: null,
                                block_time: null
                            }
                        });
                    }
                }
            }
            // No fallback: if we don't have decodedTx outputs, the next
            // chain sync rebuilds the UTXO set authoritatively. Guessing
            // the change with a magic fee constant produced wrong values.

        } catch (error) {
            // Return empty object - we'll get the real UTXOs on next refresh
        }

        return newUtxos;
    }

    /**
     * Schedule a delayed refresh to get confirmed transaction data
     */
    scheduleDelayedRefresh(refreshFunction, delay = 3000) {
        setTimeout(() => {
            refreshFunction();
        }, delay);
    }

    /**
     * Get transaction summary for logging
     */
    getTransactionSummary(transactionData) {
        const inputCount = transactionData.utxos ? transactionData.utxos.length : 0;
        const totalInput = transactionData.utxos ? 
            transactionData.utxos.reduce((sum, utxo) => sum + utxo.value, 0) : 0;
        
        return {
            txid: transactionData.txid,
            inputCount,
            totalInput,
            amountSent: transactionData.amount,
            size: transactionData.size
        };
    }
}

// Create singleton instance
const utxoManager = new UTXOManager();

export { utxoManager, UTXOManager };
export default utxoManager;
