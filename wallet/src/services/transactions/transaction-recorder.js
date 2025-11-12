'use client';

import { addTransaction, getTransactions, getAddresses } from '@/services/storage';
import { MempoolService } from '@/services/shared/mempool-service';
import { classifyTransaction, TRANSACTION_TYPES } from './transaction-classifier';
import { extractCharmTokenData } from './charm-transaction-extractor';

export class TransactionRecorder {
    constructor(blockchain, network) {
        this.blockchain = blockchain;
        this.network = network;
        // Cache for block timestamps to avoid excessive API calls
        this.timestampCache = new Map();
    }

    // Generate unique transaction ID
    generateTransactionId(type, timestamp) {
        const counter = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        return `tx_${timestamp}_${type}_${counter}`;
    }

    // Check if transaction type is a charm transaction
    isCharmTransaction(type) {
        return [
            TRANSACTION_TYPES.CHARM_RECEIVED,
            TRANSACTION_TYPES.CHARM_SENT,
            TRANSACTION_TYPES.CHARM_CONSOLIDATION,
            TRANSACTION_TYPES.CHARM_SELF_TRANSFER,
            TRANSACTION_TYPES.BRO_MINT,
            TRANSACTION_TYPES.BRO_MINING
        ].includes(type);
    }

    // Record sent transaction after successful broadcast
    async recordSentTransaction(txData, fee, addresses) {
        const timestamp = Date.now();

        const transaction = {
            id: this.generateTransactionId('sent', timestamp),
            txid: txData.txid,
            type: 'sent',
            amount: txData.amountInSats,
            fee: fee,
            timestamp: timestamp,
            status: 'pending',
            addresses: {
                from: addresses.from || [],
                to: addresses.to || []
            },
            // Add inputs if available
            inputs: txData.inputs || [],
            // Add outputs if available
            outputs: txData.outputs || [],
            metadata: {
                changeAmount: txData.change || 0,
                totalInputs: txData.totalSelected || 0
            }
        };
        
        const updatedTransactions = await addTransaction(transaction, this.blockchain, this.network);
        
        // Verify it was saved by reading it back
        const storedTransactions = await getTransactions(this.blockchain, this.network);
        const savedTx = storedTransactions.find(tx => tx.txid === transaction.txid);
        if (!savedTx) {
            // Intentionally silent in production; rely on return value and state
        }
        
        return transaction;
    }

    // Process UTXOs to detect received transactions (excluding change addresses)
    async processUTXOsForReceivedTransactions(utxos, addresses) {
        try {
            const existingTransactions = await getTransactions(this.blockchain, this.network);
            const existingTxids = new Set(
                existingTransactions
                    .filter(tx => tx.type === 'received')
                    .map(tx => tx.txid)
            );

            // Get address classification from localStorage
            const storedAddresses = await getAddresses(this.blockchain, this.network);
            const receiverAddresses = new Set(
                storedAddresses
                    .filter(addr => !addr.isChange)
                    .map(addr => addr.address)
            );

            // Flatten UTXOs from receiver addresses only
            const receiverUtxos = [];
            Object.entries(utxos).forEach(([address, addressUtxos]) => {
                if (receiverAddresses.has(address) && Array.isArray(addressUtxos)) {
                    addressUtxos.forEach(utxo => {
                        receiverUtxos.push({
                            ...utxo,
                            address: address,
                            key: `${utxo.txid}:${utxo.vout}`
                        });
                    });
                }
            });

            // Group UTXOs by transaction ID
            const txGroups = {};
            receiverUtxos.forEach(utxo => {
                const txid = utxo.txid;
                if (!txGroups[txid]) {
                    txGroups[txid] = [];
                }
                txGroups[txid].push(utxo);
            });

            // Process each transaction group
            const mempoolService = new MempoolService();
            
            for (const [txid, txUtxos] of Object.entries(txGroups)) {
                // Calculate total amount for this transaction
                const totalAmount = txUtxos.reduce((sum, utxo) => sum + (utxo.value || 0), 0);
                
                // Get timestamp from block time (in seconds), convert to milliseconds
                let blockTime = txUtxos[0].status?.block_time || txUtxos[0].blockTime;
                const blockHeight = txUtxos[0].status?.block_height || txUtxos[0].blockHeight;
                
                // If no block_time but we have blockHeight, fetch it from API (with cache)
                if (!blockTime && blockHeight) {
                    // Check cache first
                    if (this.timestampCache.has(blockHeight)) {
                        blockTime = this.timestampCache.get(blockHeight);
                    } else {
                        blockTime = await mempoolService.getBlockTimestamp(blockHeight, this.network);
                        if (blockTime) {
                            // Cache the result
                            this.timestampCache.set(blockHeight, blockTime);
                        }
                    }
                }
                
                const timestamp = blockTime ? blockTime * 1000 : Date.now();

                // Fetch full transaction details from API (inputs, outputs, fee)
                let inputs = [];
                let outputs = [];
                let fee = null;
                try {
                    const response = await mempoolService.getTransaction(txid, this.network);
                    const txDetails = response?.tx || response;
                    
                    if (txDetails) {
                        // Extract inputs
                        inputs = (txDetails.vin || []).map(input => ({
                            txid: input.txid,
                            vout: input.vout,
                            address: input.prevout?.scriptpubkey_address || null,
                            value: input.prevout?.value || null
                        }));
                        
                        // Extract ALL outputs (not just received ones)
                        outputs = (txDetails.vout || []).map(output => ({
                            address: output.scriptpubkey_address || null,
                            amount: output.value || 0,
                            vout: output.n
                        }));
                        
                        fee = txDetails.fee || null;
                    }
                } catch (error) {
                    // Silent fail - tx details are optional
                }

                // Create transaction object
                const transaction = {
                    id: this.generateTransactionId('received', timestamp),
                    txid,
                    type: 'received', // Will be updated by classifier
                    amount: totalAmount,
                    timestamp: timestamp,
                    status: 'confirmed',
                    addresses: {
                        received: txUtxos.map(u => u.address)
                    },
                    inputs: inputs,
                    outputs: outputs,
                    fee: fee,
                    blockHeight: blockHeight,
                    confirmations: Math.min(...txUtxos.map(utxo => utxo.confirmations || 1))
                };

                // Classify transaction type
                transaction.type = classifyTransaction(transaction, addresses);

                // Extract charm token data if this is a charm transaction
                if (this.isCharmTransaction(transaction.type)) {
                    console.log(`[TransactionRecorder] Extracting charm data for ${txid}, type: ${transaction.type}`);
                    try {
                        const charmData = await extractCharmTokenData(txid, this.network, addresses);
                        console.log(`[TransactionRecorder] Charm data result:`, charmData);
                        if (charmData) {
                            transaction.charmTokenData = {
                                appId: charmData.appId,
                                tokenName: charmData.tokenName,
                                tokenTicker: charmData.tokenTicker,
                                tokenImage: charmData.tokenImage,
                                tokenAmount: charmData.tokenAmount
                            };
                            console.log(`[TransactionRecorder] Added charmTokenData to transaction:`, transaction.charmTokenData);
                        } else {
                            console.log(`[TransactionRecorder] No charm data returned for ${txid}`);
                        }
                    } catch (error) {
                        console.error(`[TransactionRecorder] Error extracting charm data:`, error);
                        // Silent fail - charm data is optional
                    }
                }

                // Save or update transaction
                if (existingTxids.has(txid)) {
                    await this.updateExistingTransaction(txid, transaction, blockTime !== null);
                } else {
                    await addTransaction(transaction, this.blockchain, this.network);
                }
            }
        } catch (error) {
            throw error;
        }
    }

    // Update transaction status from blockchain
    async updateTransactionStatus(txid, status, confirmations, blockHeight) {
        try {
            const transactions = await getTransactions(this.blockchain, this.network);
            const updatedTransactions = transactions.map(tx => {
                if (tx.txid === txid) {
                    return {
                        ...tx,
                        status,
                        confirmations: confirmations || tx.confirmations,
                        blockHeight: blockHeight || tx.blockHeight
                    };
                }
                return tx;
            });

            // Save updated transactions
            const { saveTransactions } = await import('@/services/storage');
            await saveTransactions(updatedTransactions, this.blockchain, this.network);

        } catch (error) {
            throw error;
        }
    }

    // Check if transaction already exists by txid and type
    async transactionExists(txid, type) {
        try {
            const transactions = await getTransactions(this.blockchain, this.network);
            return transactions.some(tx => tx.txid === txid && tx.type === type);
        } catch (error) {
            return false;
        }
    }

    // Update existing transaction with new data (for refresh functionality)
    async updateExistingTransaction(txid, newTransactionData, updateTimestamp = false) {
        try {
            const transactions = await getTransactions(this.blockchain, this.network);
            const updatedTransactions = transactions.map(tx => {
                if (tx.txid === txid && tx.type === newTransactionData.type) {
                    // COMPLETELY REPLACE transaction data, removing old charm-related fields
                    const updated = {
                        ...newTransactionData,
                        id: tx.id, // Keep original ID
                        // Always update inputs if provided
                        inputs: newTransactionData.inputs || tx.inputs || [],
                        // Always update outputs if provided
                        outputs: newTransactionData.outputs || tx.outputs || [],
                        // Always update fee if provided
                        fee: newTransactionData.fee !== undefined ? newTransactionData.fee : tx.fee,
                    };
                    
                    // Update timestamp only if we have a real block timestamp
                    if (updateTimestamp && newTransactionData.timestamp) {
                        updated.timestamp = newTransactionData.timestamp;
                    } else {
                        updated.timestamp = tx.timestamp; // Keep original
                    }
                    
                    // IMPORTANT: Remove old metadata field if it exists (legacy data)
                    delete updated.metadata;
                    
                    // Ensure charmTokenData is from new data only
                    if (newTransactionData.charmTokenData) {
                        updated.charmTokenData = newTransactionData.charmTokenData;
                    }
                    
                    console.log(`[TransactionRecorder] Updated transaction ${txid}:`, {
                        hasCharmTokenData: !!updated.charmTokenData,
                        charmTokenData: updated.charmTokenData
                    });
                    
                    return updated;
                }
                return tx;
            });

            const { saveTransactions } = await import('@/services/storage');
            await saveTransactions(updatedTransactions, this.blockchain, this.network);
        } catch (error) {
            throw error;
        }
    }
}

export default TransactionRecorder;
