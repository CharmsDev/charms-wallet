'use client';

import { addTransaction, getTransactions, getAddresses } from '@/services/storage';
import { mempoolService } from '@/services/shared/mempool-service';
import { classifyTransaction, TRANSACTION_TYPES, CHARM_TRANSACTION_TYPES } from './transaction-classifier';
import { extractCharmTokenData } from './charm-transaction-extractor';

/** Normalize tx details into {inputs, outputs, fee} in the canonical wallet
 *  shape. Handles both mempool.space native and Explorer-wrapped responses. */
function normalizeTxDetails(txDetails) {
    if (!txDetails) return { inputs: [], outputs: [], fee: null };
    const inputs = (txDetails.vin || []).map(i => ({
        txid: i.txid,
        vout: i.vout,
        address: i.prevout?.scriptpubkey_address || null,
        value: i.prevout?.value || null,
    }));
    const outputs = (txDetails.vout || []).map(o => ({
        address: o.scriptpubkey_address || null,
        amount: o.value || 0,
        vout: o.n,
    }));
    return { inputs, outputs, fee: txDetails.fee || null };
}

/** Resolve block height + time for a tx, accepting tx details from any
 *  provider (mempool.space status, Explorer flat fields, UTXO status). Uses
 *  the provided cache to avoid re-fetching the same block height. */
async function resolveBlockStamp({ txDetails, utxo, meta, network, cache }) {
    let blockTime = txDetails?.status?.block_time
        || txDetails?.blocktime
        || txDetails?.time
        || utxo?.status?.block_time
        || utxo?.blockTime
        || meta?.block_time
        || null;
    const blockHeight = txDetails?.status?.block_height
        || txDetails?.block_height
        || utxo?.status?.block_height
        || utxo?.blockHeight
        || meta?.block_height
        || null;
    if (!blockTime && blockHeight) {
        if (cache?.has(blockHeight)) {
            blockTime = cache.get(blockHeight);
        } else {
            blockTime = await mempoolService.getBlockTimestamp(blockHeight, network);
            if (blockTime && cache) cache.set(blockHeight, blockTime);
        }
    }
    return { blockHeight, blockTime };
}

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

            // Process each transaction group. Uses shared helpers for tx
            // detail normalization and block timestamp resolution.
            for (const [txid, txUtxos] of Object.entries(txGroups)) {
                const totalAmount = txUtxos.reduce((sum, utxo) => sum + (utxo.value || 0), 0);

                let txDetails = null;
                try {
                    const response = await mempoolService.getTransaction(txid, this.network);
                    txDetails = response?.tx || response;
                } catch { /* optional */ }

                const { inputs, outputs, fee } = normalizeTxDetails(txDetails);
                const { blockHeight, blockTime } = await resolveBlockStamp({
                    txDetails, utxo: txUtxos[0], network: this.network, cache: this.timestampCache,
                });
                const timestamp = blockTime ? blockTime * 1000 : Date.now();

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

                // Extract charm token data when applicable (best-effort).
                if (this.isCharmTransaction(transaction.type)) {
                    try {
                        const charmData = await extractCharmTokenData(txid, this.network, addresses);
                        if (charmData) {
                            transaction.charmTokenData = {
                                appId: charmData.appId,
                                tokenName: charmData.tokenName,
                                tokenTicker: charmData.tokenTicker,
                                tokenImage: charmData.tokenImage,
                                tokenAmount: charmData.tokenAmount,
                            };
                        }
                    } catch { /* optional */ }
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
                    
                    // Drop legacy metadata field (superseded by charmTokenData).
                    delete updated.metadata;
                    if (newTransactionData.charmTokenData) {
                        updated.charmTokenData = newTransactionData.charmTokenData;
                    }
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
