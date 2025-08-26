'use client';

import { addTransaction, getTransactions, getAddresses } from '@/services/storage';

export class TransactionRecorder {
    constructor(blockchain, network) {
        this.blockchain = blockchain;
        this.network = network;
    }

    // Generate unique transaction ID
    generateTransactionId(type, timestamp) {
        const counter = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        return `tx_${timestamp}_${type}_${counter}`;
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
            metadata: {
                changeAmount: txData.change || 0,
                totalInputs: txData.totalSelected || 0
            }
        };

        console.log(`[TRANSACTION RECORDER] Recording sent transaction: ${transaction.txid}`);
        console.log(`[TRANSACTION RECORDER] Transaction data:`, transaction);
        console.log(`[TRANSACTION RECORDER] Using blockchain: ${this.blockchain}, network: ${this.network}`);
        
        const updatedTransactions = await addTransaction(transaction, this.blockchain, this.network);
        console.log(`[TRANSACTION RECORDER] Transaction saved to localStorage. Total transactions: ${updatedTransactions.length}`);
        
        // Verify it was saved by reading it back
        const storedTransactions = await getTransactions(this.blockchain, this.network);
        const savedTx = storedTransactions.find(tx => tx.txid === transaction.txid);
        if (savedTx) {
            console.log(`[TRANSACTION RECORDER] ✅ Transaction ${transaction.txid} verified in localStorage`);
        } else {
            console.error(`[TRANSACTION RECORDER] ❌ Transaction ${transaction.txid} NOT found in localStorage after save!`);
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

            console.log(`[TRANSACTION RECORDER] Processing UTXOs for received transactions. Receiver addresses: ${receiverAddresses.size}`);

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

            console.log(`[TRANSACTION RECORDER] Found ${receiverUtxos.length} UTXOs from receiver addresses`);

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
            for (const [txid, txUtxos] of Object.entries(txGroups)) {
                if (existingTxids.has(txid)) {
                    continue; // Skip if already processed
                }

                // Calculate total amount for this transaction
                const totalAmount = txUtxos.reduce((sum, utxo) => sum + (utxo.value || 0), 0);
                const timestamp = txUtxos[0].timestamp || Date.now();

                console.log(`[TRANSACTION RECORDER] Creating received transaction ${txid} with amount: ${totalAmount} sats`);

                // Create received transaction entry
                const transaction = {
                    id: this.generateTransactionId('received', timestamp),
                    txid,
                    type: 'received',
                    amount: totalAmount,
                    timestamp: timestamp,
                    status: 'confirmed',
                    addresses: {
                        received: txUtxos[0].address
                    },
                    blockHeight: txUtxos[0].blockHeight,
                    confirmations: Math.min(...txUtxos.map(utxo => utxo.confirmations || 1))
                };

                await addTransaction(transaction, this.blockchain, this.network);
            }
        } catch (error) {
            console.error('[TRANSACTION RECORDER] Error processing UTXOs for received transactions:', error);
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

            console.log(`[TRANSACTION RECORDER] Updated transaction ${txid} status to ${status}`);
        } catch (error) {
            console.error('[TRANSACTION RECORDER] Error updating transaction status:', error);
            throw error;
        }
    }

    // Check if transaction already exists by txid and type
    async transactionExists(txid, type) {
        try {
            const transactions = await getTransactions(this.blockchain, this.network);
            return transactions.some(tx => tx.txid === txid && tx.type === type);
        } catch (error) {
            console.error('[TRANSACTION RECORDER] Error checking transaction existence:', error);
            return false;
        }
    }
}

export default TransactionRecorder;
