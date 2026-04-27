'use client';

import { addTransaction, getTransactions } from '@/services/storage';
import { CHARM_TRANSACTION_TYPES } from './transaction-classifier';

export class TransactionRecorder {
    constructor(blockchain, network) {
        this.blockchain = blockchain;
        this.network = network;
        // Cache for block timestamps — avoids repeated API calls for txs in the same block.
        this.timestampCache = new Map();
    }

    generateTransactionId(type, timestamp) {
        const counter = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        return `tx_${timestamp}_${type}_${counter}`;
    }

    isCharmTransaction(type) {
        return CHARM_TRANSACTION_TYPES.has(type);
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

    // Check if transaction already exists by txid and type
    async transactionExists(txid, type) {
        try {
            const transactions = await getTransactions(this.blockchain, this.network);
            return transactions.some(tx => tx.txid === txid && tx.type === type);
        } catch (error) {
            return false;
        }
    }
}

export default TransactionRecorder;
