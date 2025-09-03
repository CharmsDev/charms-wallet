'use client';

import { bitcoinApiRouter } from '@/services/shared/bitcoin-api-router';
import { getAddresses, saveTransactions, getTransactions } from '@/services/storage';
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';

/**
 * Transaction History Service
 * Recovers complete transaction history for Bitcoin wallets
 */
export class TransactionHistoryService {
    constructor() {
        this.rateLimitDelay = 100; // 100ms between requests to avoid rate limiting
    }

    /**
     * Main function to recover transaction history for wallet
     */
    async recoverTransactionHistory(blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET, progressCallback = null, maxAddresses = undefined) {
        if (progressCallback) {
            progressCallback({ stage: 'scan_transactions_start' });
        }
        
        try {
            // Get wallet addresses and apply limit
            let addresses = await getAddresses(blockchain, network);
            // Limit addresses to 12 for performance
            if (!maxAddresses || maxAddresses <= 0) {
                addresses = addresses.slice(0, 12);
            } else {
                addresses = addresses.slice(0, Math.min(maxAddresses, 12));
            }
            if (!addresses || addresses.length === 0) {
                return [];
            }
            
            // Get transaction history for all addresses
            const allTransactions = [];
            const processedTxids = new Set(); // Avoid duplicates
            for (let i = 0; i < addresses.length; i++) {
                const address = addresses[i];
                
                if (progressCallback) {
                    // Keep progress generic; caller may ignore numbers
                    progressCallback({
                        current: i + 1,
                        total: addresses.length,
                        address: address.address,
                        stage: 'scanning'
                    });
                }

                try {
                    const transactions = await getTransactions(address.address, blockchain, network);
                    
                    if (transactions && transactions.length > 0) {
                        for (const tx of transactions) {
                            if (!processedTxids.has(tx.txid)) {
                                processedTxids.add(tx.txid);
                                
                                // Check if transaction involves wallet addresses
                                const walletInvolvement = await this.checkWalletInvolvement(tx, addresses, blockchain, network);
                                
                                if (walletInvolvement.isInvolved) {
                                    // Enhance transaction with wallet-specific data
                                    const enhancedTx = {
                                        ...tx,
                                        ...walletInvolvement
                                    };
                                    
                                    allTransactions.push(enhancedTx);
                                }
                            }
                        }
                    }
                    
                    // Rate limiting
                    await this.delay(this.rateLimitDelay);
                } catch (error) {
                    console.error(`[TX-HISTORY] Error processing address ${address.address}:`, error);
                    // Continue with next address
                }
            }

            // Remove duplicate transactions
            const uniqueTransactions = this.removeDuplicateTransactions(allTransactions);
            // Sort transactions by timestamp (newest first)
            const sortedTransactions = uniqueTransactions.sort((a, b) => b.timestamp - a.timestamp);
            
            // Save to localStorage
            await saveTransactions(sortedTransactions, blockchain, network);
            
            if (progressCallback) {
                progressCallback({
                    current: addresses.length,
                    total: addresses.length,
                    stage: 'scan_transactions_completed',
                    transactionCount: sortedTransactions.length
                });
            }

            return sortedTransactions;
            
        } catch (error) {
            throw error;
        }
    }

    /**
     * Fetch transaction history for specific address
     */
    async getAddressTransactionHistory(address, network) {
        try {
            const addressInfo = await bitcoinApiRouter.makeRequest('bb_getaddress', [address], network);
            
            if (!addressInfo) {
                return [];
            }

            // Normalize tx list from provider response
            let txIds = [];
            if (Array.isArray(addressInfo.txs)) {
                txIds = addressInfo.txs;
            } else if (Array.isArray(addressInfo.transactions)) {
                txIds = addressInfo.transactions.map(t => t.txid).filter(Boolean);
            } else if (Array.isArray(addressInfo.txids)) {
                txIds = addressInfo.txids;
            } else {
                return [];
            }

            
            // Fetch full transaction details for each txid
            const transactions = [];
            for (const txid of txIds) {
                try {
                    const txDetails = await bitcoinApiRouter.makeRequest('bb_gettransaction', [txid], network);
                    if (txDetails) {
                        transactions.push(txDetails);
                    }
                } catch (error) {
                    // Continue with other transactions
                }
                
                // Rate limiting between transaction fetches
                await this.delay(this.rateLimitDelay);
            }
            
            return transactions;
            
        } catch (error) {
            return [];
        }
    }

    /**
     * Analyze transaction involvement and type
     */
    async analyzeTransaction(tx, walletAddresses, network) {
        try {
            const walletAddressSet = new Set(walletAddresses.map(addr => addr.address));
            
            // Analyze inputs (where money comes from)
            const walletInputs = tx.vin.filter(input => 
                input.addresses && input.addresses.some(addr => walletAddressSet.has(addr))
            );
            const totalInputValue = walletInputs.reduce((sum, input) => 
                sum + parseFloat(input.value || 0), 0
            );
            
            // Analyze outputs (where money goes to)
            const walletOutputs = tx.vout.filter(output => 
                output.scriptPubKey.addresses && 
                output.scriptPubKey.addresses.some(addr => walletAddressSet.has(addr))
            );
            const totalOutputValue = tx.vout.reduce((sum, output) => 
                sum + parseFloat(output.value || 0), 0
            );
            const totalExternalValue = tx.vout.reduce((sum, output) => 
                sum + parseFloat(output.value || 0), 0
            ) - walletOutputs.reduce((sum, output) => 
                sum + parseFloat(output.value || 0), 0
            );
            
            // Determine transaction type
            const hasWalletInputs = walletInputs.length > 0;
            const hasWalletOutputs = walletOutputs.length > 0;
            
            let transactionType = null;
            let amount = 0;
            let fee = 0;
            
            if (hasWalletInputs && !hasWalletOutputs) {
                // Sent transaction - all inputs from wallet, no outputs to wallet
                transactionType = 'sent';
                amount = totalOutputValue;
                fee = totalInputValue - totalOutputValue;
                
            } else if (hasWalletInputs && hasWalletOutputs) {
                // Sent transaction with change
                transactionType = 'sent';
                amount = totalExternalValue; // Amount sent to external addresses
                fee = totalInputValue - totalOutputValue;
                
                // Only create transaction entry if we actually sent money externally
                if (amount <= 0) {
                    return null;
                }
                
            } else if (!hasWalletInputs && hasWalletOutputs) {
                // Received transaction
                transactionType = 'received';
                amount = walletOutputs.reduce((sum, output) => 
                    sum + parseFloat(output.value || 0), 0
                );
                
            } else {
                return null;
            }

            // Create transaction entry
            const transactionEntry = {
                id: `tx_${tx.time || Date.now()}_${transactionType}_${tx.txid.substring(0, 8)}`,
                txid: tx.txid,
                type: transactionType,
                amount: amount,
                fee: transactionType === 'sent' ? fee : undefined,
                timestamp: (tx.time || tx.blocktime || Date.now()) * 1000, // Convert to milliseconds
                status: tx.confirmations > 0 ? 'confirmed' : 'pending',
                addresses: {
                    from: transactionType === 'sent' ? walletInputs.map(input => input.addresses[0]) : undefined,
                    to: transactionType === 'sent' ? tx.vout.filter(output => !walletAddressSet.has(output.scriptPubKey.addresses[0])).map(output => output.scriptPubKey.addresses[0]) : undefined,
                    received: transactionType === 'received' ? walletOutputs[0].scriptPubKey.addresses[0] : undefined
                },
                blockHeight: tx.status?.block_height || null,
                confirmations: tx.confirmations || 0,
                metadata: {
                    isSelfSend: hasWalletInputs && hasWalletOutputs && amount === 0,
                    changeAmount: transactionType === 'sent' ? walletOutputs.reduce((sum, output) => 
                        sum + parseFloat(output.value || 0), 0
                    ) : undefined,
                    totalInputs: totalInputValue
                }
            };

            return transactionEntry;
            
        } catch (error) {
            console.error(`[TX-HISTORY] Error analyzing transaction ${tx.txid}:`, error);
            return null;
        }
    }

    /**
     * Utility function for rate limiting
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get existing transaction history from storage
     */
    async getStoredTransactionHistory(blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        return await getTransactions(blockchain, network);
    }

    /**
     * Check if transaction history recovery is needed
     */
    async isHistoryRecoveryNeeded(blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        const existingTransactions = await getTransactions(blockchain, network);
        const addresses = await getAddresses(blockchain, network);
        
        // If we have addresses but no transactions, recovery is needed
        return addresses.length > 0 && existingTransactions.length === 0;
    }

    /**
     * Remove duplicate transactions
     */
    removeDuplicateTransactions(transactions) {
        const uniqueTxids = new Set();
        const uniqueTransactions = [];

        for (const tx of transactions) {
            if (!uniqueTxids.has(tx.txid)) {
                uniqueTxids.add(tx.txid);
                uniqueTransactions.push(tx);
            }
        }

        return uniqueTransactions;
    }
}

export const transactionHistoryService = new TransactionHistoryService();
export default transactionHistoryService;
