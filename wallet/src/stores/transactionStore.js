'use client';

import { create } from 'zustand';
import { getTransactions, addTransaction, updateTransactionStatus, TransactionEntry } from '@/services/storage';
import { BLOCKCHAINS, NETWORKS } from './blockchainStore';

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
            console.log(`[TRANSACTION STORE] Network changed from ${state.currentNetwork} to ${networkKey}, clearing transactions`);
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
            console.log(`[TRANSACTION STORE] Loading transactions for ${blockchain}-${network}`);

            const storedTransactions = await getTransactions(blockchain, network);
            
            // Calculate pagination info
            const totalTransactions = storedTransactions.length;
            const pageSize = state.pagination.pageSize;
            const totalPages = Math.ceil(totalTransactions / pageSize);

            set({
                transactions: storedTransactions,
                isLoading: false,
                initialized: true,
                error: null,
                pagination: {
                    ...state.pagination,
                    totalTransactions,
                    totalPages
                }
            });

            console.log(`[TRANSACTION STORE] Loaded ${storedTransactions.length} transactions, ${totalPages} pages`);
        } catch (error) {
            console.error('[TRANSACTION STORE] Error loading transactions:', error);
            set({
                transactions: [],
                isLoading: false,
                initialized: true,
                error: error.message
            });
        }
    },

    // Add or update a transaction
    addTransaction: async (transaction, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) => {
        try {
            console.log(`[TRANSACTION STORE] Adding transaction ${transaction.txid}`);

            const updatedTransactions = await addTransaction(transaction, blockchain, network);

            set({
                transactions: updatedTransactions,
                error: null
            });

            console.log(`[TRANSACTION STORE] Transaction added, total: ${updatedTransactions.length}`);
        } catch (error) {
            console.error('[TRANSACTION STORE] Error adding transaction:', error);
            set({ error: error.message });
        }
    },

    // Update transaction status
    updateTransactionStatus: async (txid, status, confirmations, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) => {
        try {
            console.log(`[TRANSACTION STORE] Updating transaction ${txid} status to ${status}`);

            const updatedTransactions = await updateTransactionStatus(txid, status, confirmations, blockchain, network);

            set({
                transactions: updatedTransactions,
                error: null
            });
        } catch (error) {
            console.error('[TRANSACTION STORE] Error updating transaction status:', error);
            set({ error: error.message });
        }
    },

    // Process UTXOs to extract transaction data
    processUTXOsForTransactions: async (utxos, addresses, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) => {
        try {
            const state = get();
            const existingTxids = new Set(state.transactions.map(tx => tx.txid));
            const walletAddresses = new Set(addresses.map(addr => addr.address));

            console.log(`[TRANSACTION STORE] Processing UTXOs for transactions. Wallet addresses: ${walletAddresses.size}`);

            // Flatten UTXOs from all addresses
            const allUtxos = [];
            Object.entries(utxos).forEach(([address, addressUtxos]) => {
                if (Array.isArray(addressUtxos)) {
                    addressUtxos.forEach(utxo => {
                        allUtxos.push({
                            ...utxo,
                            address: address,
                            key: `${utxo.txid}:${utxo.vout}`
                        });
                    });
                }
            });

            console.log(`[TRANSACTION STORE] Found ${allUtxos.length} UTXOs to process`);

            // Group UTXOs by transaction ID
            const txGroups = {};
            allUtxos.forEach(utxo => {
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

                // Calculate total amount for this transaction (sum of all UTXOs)
                const totalAmount = txUtxos.reduce((sum, utxo) => sum + (utxo.value || 0), 0);

                console.log(`[TRANSACTION STORE] Processing transaction ${txid} with ${txUtxos.length} UTXOs, total amount: ${totalAmount} sats`);

                // Determine involved addresses
                const involvedAddresses = [...new Set(txUtxos.map(utxo => utxo.address).filter(Boolean))];

                // Create transaction entry
                const transaction = {
                    id: txid, // Add unique id for React key
                    txid,
                    type: 'received', // All UTXOs represent received transactions
                    amount: totalAmount,
                    status: 'confirmed',
                    confirmations: Math.min(...txUtxos.map(utxo => utxo.confirmations || 1)),
                    timestamp: txUtxos[0].timestamp || Date.now(),
                    blockHeight: txUtxos[0].blockHeight,
                    addresses: involvedAddresses,
                    utxos: txUtxos.map(utxo => utxo.key)
                };

                await get().addTransaction(transaction, blockchain, network);
            }
        } catch (error) {
            console.error('[TRANSACTION STORE] Error processing UTXOs for transactions:', error);
            set({ error: error.message });
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

export const useTransactions = () => useTransactionStore();
