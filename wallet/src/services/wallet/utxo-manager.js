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
            console.log('[UTXOManager] Processing transaction completion:', transactionData.txid);
            
            // Prepare spent UTXOs for removal
            const spentUtxos = transactionData.utxos.map(utxo => ({
                txid: utxo.txid,
                vout: utxo.vout,
                address: utxo.address
            }));

            console.log('[UTXOManager] Removing spent UTXOs:', spentUtxos);

            // Create potential new UTXOs from transaction outputs
            const newUtxos = await this.createNewUtxosFromTransaction(transactionData, blockchain, network);

            // Update UTXO store
            await updateAfterTransaction(spentUtxos, newUtxos, blockchain, network);

            console.log('[UTXOManager] UTXO state updated successfully');
            
            return {
                success: true,
                spentUtxos: spentUtxos.length,
                newUtxos: Object.values(newUtxos).reduce((total, utxos) => total + utxos.length, 0)
            };

        } catch (error) {
            console.error('[UTXOManager] Error processing transaction completion:', error);
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
                        console.log('[UTXOManager] Found change output:', {
                            address: output.address,
                            value: output.value,
                            vout
                        });

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
            } else {
                // Fallback: Try to estimate change output
                // This is less reliable but better than nothing
                const totalInput = transactionData.utxos.reduce((sum, utxo) => sum + utxo.value, 0);
                const amountSent = Math.floor(transactionData.amount * 100000000); // Convert to satoshis
                const estimatedFee = transactionData.size ? transactionData.size * 5 : 1000; // Rough estimate
                const changeAmount = totalInput - amountSent - estimatedFee;

                if (changeAmount > 546) { // Above dust threshold
                    // Find a change address
                    const changeAddress = addresses.find(addr => addr.isChange)?.address || addresses[0]?.address;
                    
                    if (changeAddress) {
                        console.log('[UTXOManager] Estimated change output:', {
                            address: changeAddress,
                            value: changeAmount,
                            vout: 1 // Typically change is output 1
                        });

                        newUtxos[changeAddress] = [{
                            txid: transactionData.txid,
                            vout: 1,
                            value: changeAmount,
                            status: {
                                confirmed: false,
                                block_height: null,
                                block_hash: null,
                                block_time: null
                            }
                        }];
                    }
                }
            }

        } catch (error) {
            console.warn('[UTXOManager] Could not create new UTXOs from transaction:', error);
            // Return empty object - we'll get the real UTXOs on next refresh
        }

        return newUtxos;
    }

    /**
     * Schedule a delayed refresh to get confirmed transaction data
     */
    scheduleDelayedRefresh(refreshFunction, delay = 3000) {
        console.log(`[UTXOManager] Scheduling UTXO refresh in ${delay}ms`);
        
        setTimeout(() => {
            console.log('[UTXOManager] Executing scheduled UTXO refresh');
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
