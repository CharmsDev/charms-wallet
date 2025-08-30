'use client';

import { quickNodeService } from '@/services/shared/quicknode-service';
import { getAddresses, saveTransactions, getTransactions } from '@/services/storage';
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';

/**
 * Transaction History Recovery Service
 * Modular service to recover complete transaction history from blockchain
 */
export class TransactionHistoryService {
    constructor() {
        this.rateLimitDelay = 100; // 100ms between requests to avoid rate limiting
    }

    /**
     * Main function to recover transaction history for wallet
     */
    async recoverTransactionHistory(blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET, progressCallback = null) {
        console.log(`[TX-HISTORY] Starting transaction history recovery for ${blockchain}/${network}`);
        
        try {
            // Get all wallet addresses
            const addresses = await getAddresses(blockchain, network);
            if (!addresses || addresses.length === 0) {
                console.log('[TX-HISTORY] No addresses found, skipping history recovery');
                return [];
            }

            console.log(`[TX-HISTORY] Found ${addresses.length} addresses to scan`);
            
            // Get transaction history for all addresses
            const allTransactions = [];
            const processedTxids = new Set(); // Avoid duplicates
            
            for (let i = 0; i < addresses.length; i++) {
                const address = addresses[i];
                
                if (progressCallback) {
                    progressCallback({
                        current: i + 1,
                        total: addresses.length,
                        address: address.address,
                        stage: 'scanning'
                    });
                }

                try {
                    const addressTransactions = await this.getAddressTransactionHistory(address.address, network);
                    
                    // Process and filter transactions
                    for (const tx of addressTransactions) {
                        if (!processedTxids.has(tx.txid)) {
                            processedTxids.add(tx.txid);
                            
                            // Analyze transaction to determine if it's sent or received
                            const processedTx = await this.analyzeTransaction(tx, addresses, network);
                            if (processedTx) {
                                allTransactions.push(processedTx);
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

            // Sort transactions by timestamp (newest first)
            allTransactions.sort((a, b) => b.timestamp - a.timestamp);
            
            console.log(`[TX-HISTORY] Found ${allTransactions.length} unique transactions`);
            
            // Save to localStorage
            await saveTransactions(allTransactions, blockchain, network);
            
            if (progressCallback) {
                progressCallback({
                    current: addresses.length,
                    total: addresses.length,
                    stage: 'completed',
                    transactionCount: allTransactions.length
                });
            }

            return allTransactions;
            
        } catch (error) {
            console.error('[TX-HISTORY] Error during transaction history recovery:', error);
            throw error;
        }
    }

    /**
     * Get transaction history for a specific address using QuickNode Blockbook
     */
    async getAddressTransactionHistory(address, network) {
        try {
            console.log(`[TX-HISTORY] Getting history for address: ${address}`);
            
            // Use QuickNode Blockbook add-on to get address history
            // bb_getaddress returns address info including transaction list
            const addressInfo = await quickNodeService.makeRequest('bb_getaddress', [address], network);
            
            if (!addressInfo || !addressInfo.txs) {
                console.log(`[TX-HISTORY] No transactions found for address ${address}`);
                return [];
            }

            console.log(`[TX-HISTORY] Found ${addressInfo.txs.length} transactions for ${address}`);
            
            // Get detailed transaction information for each txid
            const transactions = [];
            for (const txid of addressInfo.txs) {
                try {
                    const txDetails = await quickNodeService.getTransaction(txid, network);
                    if (txDetails) {
                        transactions.push(txDetails);
                    }
                    // Small delay between transaction requests
                    await this.delay(50);
                } catch (error) {
                    console.error(`[TX-HISTORY] Error getting transaction ${txid}:`, error);
                    // Continue with next transaction
                }
            }
            
            return transactions;
            
        } catch (error) {
            console.error(`[TX-HISTORY] Error getting address history for ${address}:`, error);
            return [];
        }
    }

    /**
     * Analyze a transaction to determine if it's sent, received, or internal transfer
     */
    async analyzeTransaction(tx, walletAddresses, network) {
        try {
            const walletAddressSet = new Set(walletAddresses.map(addr => addr.address));
            
            // Analyze inputs (where money comes from)
            const inputAddresses = [];
            let totalInputValue = 0;
            let walletInputValue = 0;
            
            for (const input of tx.vin || []) {
                if (input.prevout) {
                    const inputAddress = input.prevout.scriptpubkey_address;
                    if (inputAddress) {
                        inputAddresses.push(inputAddress);
                        totalInputValue += input.prevout.value || 0;
                        
                        if (walletAddressSet.has(inputAddress)) {
                            walletInputValue += input.prevout.value || 0;
                        }
                    }
                }
            }

            // Analyze outputs (where money goes to)
            const outputAddresses = [];
            let totalOutputValue = 0;
            let walletOutputValue = 0;
            const walletOutputs = [];
            
            for (const output of tx.vout || []) {
                const outputAddress = output.scriptpubkey_address;
                if (outputAddress) {
                    outputAddresses.push(outputAddress);
                    totalOutputValue += output.value || 0;
                    
                    if (walletAddressSet.has(outputAddress)) {
                        walletOutputValue += output.value || 0;
                        walletOutputs.push({
                            address: outputAddress,
                            value: output.value || 0
                        });
                    }
                }
            }

            // Determine transaction type
            const hasWalletInputs = walletInputValue > 0;
            const hasWalletOutputs = walletOutputValue > 0;
            
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
                amount = totalOutputValue - walletOutputValue; // Amount sent to external addresses
                fee = totalInputValue - totalOutputValue;
                
                // Only create transaction entry if we actually sent money externally
                if (amount <= 0) {
                    console.log(`[TX-HISTORY] Skipping internal transaction ${tx.txid}`);
                    return null;
                }
                
            } else if (!hasWalletInputs && hasWalletOutputs) {
                // Received transaction
                transactionType = 'received';
                amount = walletOutputValue;
                
            } else {
                // No wallet involvement
                console.log(`[TX-HISTORY] Transaction ${tx.txid} has no wallet involvement`);
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
                    from: transactionType === 'sent' ? inputAddresses.filter(addr => walletAddressSet.has(addr)) : undefined,
                    to: transactionType === 'sent' ? outputAddresses.filter(addr => !walletAddressSet.has(addr)) : undefined,
                    received: transactionType === 'received' ? walletOutputs[0]?.address : undefined
                },
                blockHeight: tx.status?.block_height || null,
                confirmations: tx.confirmations || 0,
                metadata: {
                    isSelfSend: hasWalletInputs && hasWalletOutputs && amount === 0,
                    changeAmount: transactionType === 'sent' ? walletOutputValue : undefined,
                    totalInputs: totalInputValue
                }
            };

            console.log(`[TX-HISTORY] Processed ${transactionType} transaction ${tx.txid}: ${amount} sats`);
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
}

export const transactionHistoryService = new TransactionHistoryService();
export default transactionHistoryService;
