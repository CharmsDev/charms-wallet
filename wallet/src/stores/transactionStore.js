'use client';

import { create } from 'zustand';
import { getTransactions, addTransaction as addTransactionToStorage, updateTransactionStatus, TransactionEntry } from '@/services/storage';
import { BLOCKCHAINS, NETWORKS } from './blockchainStore';
import TransactionRecorder from '@/services/transactions/transaction-recorder';

const useTransactionStore = create((set, get) => ({
    transactions: [],
    isLoading: false,
    error: null,
    initialized: false,
    currentNetwork: null, // Track current network for change detection

    // Pagination state
    pagination: {
        currentPage: 1,
        pageSize: 8,
        totalTransactions: 0,
        totalPages: 0
    },

    // Load transactions from localStorage
    loadTransactions: async (blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) => {
        const state = get();
        

        // Check if network has changed - if so, clear existing transactions
        const networkKey = `${blockchain}-${network}`;
        if (state.currentNetwork && state.currentNetwork !== networkKey) {
            set({
                transactions: [],
                initialized: false,
                error: null,
                pagination: {
                    currentPage: 1,
                    pageSize: 8,
                    totalTransactions: 0,
                    totalPages: 0
                }
            });
        }

        // Update current network
        set({ currentNetwork: networkKey });

        // Prevent multiple simultaneous loads
        if (state.isLoading) {
            return;
        }

        set({ isLoading: true, error: null });

        try {
            const storedTransactions = await getTransactions(blockchain, network);

            // Sort transactions by timestamp (most recent first)
            const sortedTransactions = storedTransactions.sort((a, b) => b.timestamp - a.timestamp);

            // Calculate pagination info
            const totalTransactions = sortedTransactions.length;
            const pageSize = state.pagination.pageSize;
            const totalPages = Math.ceil(totalTransactions / pageSize);

            set({
                transactions: sortedTransactions,
                isLoading: false,
                initialized: true,
                error: null,
                pagination: {
                    ...state.pagination,
                    totalTransactions,
                    totalPages
                }
            });
        } catch (error) {
            set({
                transactions: [],
                isLoading: false,
                initialized: true,
                error: error.message
            });
        }
    },

    // Record sent transaction (called by transaction orchestrator)
    recordSentTransaction: async (transactionData, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) => {
        
        try {
            const updatedTransactions = await addTransactionToStorage(transactionData, blockchain, network);

            // Update pagination info
            const state = get();
            const totalTransactions = updatedTransactions.length;
            const totalPages = Math.ceil(totalTransactions / state.pagination.pageSize);

            set({
                transactions: updatedTransactions,
                error: null,
                pagination: {
                    ...state.pagination,
                    totalTransactions,
                    totalPages
                }
            });
            
        } catch (error) {
            set({ error: error.message });
        }
    },

    // Add or update a transaction
    addTransaction: async (transaction, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) => {
        try {
            const updatedTransactions = await addTransactionToStorage(transaction, blockchain, network);

            // Update pagination info
            const state = get();
            const totalTransactions = updatedTransactions.length;
            const totalPages = Math.ceil(totalTransactions / state.pagination.pageSize);

            set({
                transactions: updatedTransactions,
                error: null,
                pagination: {
                    ...state.pagination,
                    totalTransactions,
                    totalPages
                }
            });
        } catch (error) {
            set({ error: error.message });
        }
    },

    // Update transaction status
    updateTransactionStatus: async (txid, status, confirmations, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) => {
        try {
            const updatedTransactions = await updateTransactionStatus(txid, status, confirmations, blockchain, network);

            set({
                transactions: updatedTransactions,
                error: null
            });
        } catch (error) {
            set({ error: error.message });
        }
    },

    // Process UTXOs to detect received transactions (manual refresh only)
    processUTXOsForReceivedTransactions: async (utxos, addresses, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) => {
        try {
            const transactionRecorder = new TransactionRecorder(blockchain, network);
            await transactionRecorder.processUTXOsForReceivedTransactions(utxos, addresses);
            await get().loadTransactions(blockchain, network);
        } catch (error) {
            set({ error: error.message });
        }
    },

    // Re-extract charm data for all existing charm transactions
    reprocessCharmTransactions: async (blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET, addresses = []) => {
        try {
            console.log('[TransactionStore] Reprocessing all charm transactions...');
            const { getTransactions, saveTransactions } = await import('@/services/storage');
            const { extractCharmTokenData } = await import('@/services/transactions/charm-transaction-extractor');
            const { classifyTransaction } = await import('@/services/transactions/transaction-classifier');
            const { MempoolService } = await import('@/services/shared/mempool-service');
            
            const mempoolService = new MempoolService();
            const transactions = await getTransactions(blockchain, network);
            const charmTypes = ['charm_received', 'charm_sent', 'charm_consolidation', 'charm_self_transfer', 'bro_mint', 'bro_mining'];
            
            const updatedTransactions = await Promise.all(transactions.map(async (tx) => {
                // If transaction has no inputs/outputs, fetch them from API
                if (!tx.inputs || tx.inputs.length === 0 || !tx.outputs || tx.outputs.length === 0) {
                    console.log(`[TransactionStore] Fetching missing data for ${tx.txid?.slice(0,8)}`);
                    try {
                        const response = await mempoolService.getTransaction(tx.txid, network);
                        const txDetails = response?.tx || response;
                        
                        if (txDetails) {
                            // Extract inputs
                            tx.inputs = (txDetails.vin || []).map(input => ({
                                txid: input.txid,
                                vout: input.vout,
                                address: input.prevout?.scriptpubkey_address || null,
                                value: input.prevout?.value || null
                            }));
                            
                            // Extract outputs
                            tx.outputs = (txDetails.vout || []).map(output => ({
                                address: output.scriptpubkey_address || null,
                                amount: output.value || 0,
                                vout: output.n
                            }));
                            
                            tx.fee = txDetails.fee || tx.fee;
                            console.log(`[TransactionStore] Fetched ${tx.inputs.length} inputs, ${tx.outputs.length} outputs`);
                        }
                    } catch (error) {
                        console.error(`[TransactionStore] Error fetching tx data:`, error);
                    }
                }
                
                // Re-classify transaction
                tx.type = classifyTransaction(tx, addresses);
                
                // If it's a charm transaction, re-extract data
                if (charmTypes.includes(tx.type)) {
                    console.log(`[TransactionStore] Reprocessing ${tx.txid}, type: ${tx.type}`);
                    try {
                        const charmData = await extractCharmTokenData(tx.txid, network, addresses);
                        if (charmData) {
                            // Remove old metadata
                            delete tx.metadata;
                            
                            // Add new charmTokenData
                            tx.charmTokenData = {
                                appId: charmData.appId,
                                tokenName: charmData.tokenName,
                                tokenTicker: charmData.tokenTicker,
                                tokenImage: charmData.tokenImage,
                                tokenAmount: charmData.tokenAmount
                            };
                            console.log(`[TransactionStore] Updated ${tx.txid} with:`, tx.charmTokenData);
                        }
                    } catch (error) {
                        console.error(`[TransactionStore] Error reprocessing ${tx.txid}:`, error);
                    }
                }
                return tx;
            }));
            
            // Deduplicate by txid - keep the most recent one (last in array)
            const txidMap = new Map();
            updatedTransactions.forEach(tx => {
                txidMap.set(tx.txid, tx);
            });
            const deduplicatedTransactions = Array.from(txidMap.values());
            
            console.log(`[TransactionStore] Removed ${updatedTransactions.length - deduplicatedTransactions.length} duplicate transactions`);
            
            await saveTransactions(deduplicatedTransactions, blockchain, network);
            console.log('[TransactionStore] Reprocessing complete');
        } catch (error) {
            console.error('[TransactionStore] Error reprocessing charm transactions:', error);
            set({ error: error.message });
        }
    },

    // Check if transaction exists by txid and type
    checkTransactionExists: async (txid, type, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) => {
        try {
            const transactionRecorder = new TransactionRecorder(blockchain, network);
            return await transactionRecorder.transactionExists(txid, type);
        } catch (error) {
            return false;
        }
    },

    // Clear transactions
    clearTransactions: () => {
        set({
            transactions: [],
            isLoading: false,
            error: null,
            initialized: false,
            currentNetwork: null
        });
    },

    // Get paginated transactions
    getPaginatedTransactions: () => {
        const state = get();
        const { currentPage, pageSize } = state.pagination;
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + pageSize;

        return state.transactions.slice(startIndex, endIndex);
    },

    // Navigate to specific page
    goToPage: (page) => {
        const state = get();
        const { totalPages } = state.pagination;

        if (page >= 1 && page <= totalPages) {
            set({
                pagination: {
                    ...state.pagination,
                    currentPage: page
                }
            });
        }
    },

    // Navigate to next page
    nextPage: () => {
        const state = get();
        const { currentPage, totalPages } = state.pagination;

        if (currentPage < totalPages) {
            set({
                pagination: {
                    ...state.pagination,
                    currentPage: currentPage + 1
                }
            });
        }
    },

    // Navigate to previous page
    previousPage: () => {
        const state = get();
        const { currentPage } = state.pagination;

        if (currentPage > 1) {
            set({
                pagination: {
                    ...state.pagination,
                    currentPage: currentPage - 1
                }
            });
        }
    },

    // Update page size
    setPageSize: (newPageSize) => {
        const state = get();
        const totalPages = Math.ceil(state.pagination.totalTransactions / newPageSize);
        const currentPage = Math.min(state.pagination.currentPage, totalPages);

        set({
            pagination: {
                ...state.pagination,
                pageSize: newPageSize,
                totalPages,
                currentPage: currentPage || 1
            }
        });
    },

    // Get recent transactions (last N) - kept for backward compatibility
    getRecentTransactions: (limit = 10) => {
        const state = get();
        return state.transactions.slice(0, limit);
    }
}));

export { useTransactionStore };
export const useTransactions = () => useTransactionStore();
