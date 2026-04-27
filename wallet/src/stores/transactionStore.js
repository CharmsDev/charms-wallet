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

            // Sort most-recent first. Prefer `blockHeight` because during
            // a fresh rescan many txs receive the same `Date.now()` fallback
            // timestamp, which would leave them in arbitrary order.
            const sortedTransactions = storedTransactions.sort((a, b) => {
                const bh = (b.blockHeight ?? b.block_height ?? 0) - (a.blockHeight ?? a.block_height ?? 0);
                if (bh !== 0) return bh;
                return (b.timestamp || 0) - (a.timestamp || 0);
            });

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

    // Process UTXOs to detect received transactions (manual refresh only).
    // The full per-address history scan was removed — `transactions/batch`
    // covers all sent + received history with `since_block` watermark.
    // Kept as a defensive backstop for the UTXO-only path until we're sure
    // the indexer covers every edge case.
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
            const { getTransactions, saveTransactions } = await import('@/services/storage');
            const { extractCharmTokenData } = await import('@/services/transactions/charm-transaction-extractor');
            const { classifyTransaction, CHARM_TRANSACTION_TYPES } = await import('@/services/transactions/transaction-classifier');
            const { explorerWalletService } = await import('@/services/shared/explorer-wallet-service');

            const transactions = await getTransactions(blockchain, network);
            const ownAddrs = new Set((addresses || []).map(a => a.address || a).filter(Boolean));
            // Seed placeholder txids — beam-in vs beam-out detection needs them.
            const placeholderTxids = new Set(
                transactions.filter(t => t.type === 'btc_placeholder').map(t => t.txid)
            );

            const updatedTransactions = await Promise.all(transactions.map(async (tx) => {
                // Fill in missing inputs/outputs via the decoded-tx helper
                // (which resolves prevout addresses by fetching parent txs).
                // `detailsChecked: true` short-circuits retries.
                if ((!tx.inputs?.length || !tx.outputs?.length) && !tx.detailsChecked) {
                    try {
                        const decoded = await explorerWalletService.getDecodedTransaction(tx.txid, network);
                        if (decoded) {
                            tx.inputs = decoded.inputs;
                            tx.outputs = decoded.outputs;
                            tx.fee = decoded.fee || tx.fee;
                            // Re-derive net amount from vin/vout instead of trusting
                            // the indexer's per-address number (which is 0 for txs
                            // where the user's main receive address didn't change
                            // balance, but the wallet still holds dust outputs).
                            const inFromUs = tx.inputs.reduce((s, i) =>
                                s + (ownAddrs.has(i.address) ? (i.value || 0) : 0), 0);
                            const outToUs = tx.outputs.reduce((s, o) =>
                                s + (ownAddrs.has(o.address) ? (o.amount || 0) : 0), 0);
                            const delta = outToUs - inFromUs;
                            if (delta !== 0) tx.amount = Math.abs(delta);
                        }
                    } catch { /* parent fetch failed — flag below stops retry */ }
                    tx.detailsChecked = true;
                }

                tx.type = classifyTransaction(tx, addresses, { placeholderTxids });

                // Skip the indexer round trip if we already have the answer.
                // `charmChecked: true` is set by transactions-sync (from the
                // batch endpoint's `charm.detected` field) and by the migration
                // after its one-shot pass — so we never re-query.
                if (!tx.charmChecked && CHARM_TRANSACTION_TYPES.has(tx.type)) {
                    try {
                        const charmData = await extractCharmTokenData(tx.txid, network, addresses);
                        if (charmData) {
                            delete tx.metadata; // legacy field — superseded by charmTokenData
                            tx.charmTokenData = {
                                appId: charmData.appId,
                                tokenName: charmData.tokenName,
                                tokenTicker: charmData.tokenTicker,
                                tokenImage: charmData.tokenImage,
                                tokenAmount: charmData.tokenAmount,
                            };
                        }
                    } catch { /* tx not indexed — silenced; flag below stops retry */ }
                    tx.charmChecked = true;
                }
                return tx;
            }));

            // Dedupe by txid — the last entry wins (assumed freshest).
            const txidMap = new Map();
            for (const tx of updatedTransactions) txidMap.set(tx.txid, tx);
            const deduplicatedTransactions = Array.from(txidMap.values());
            
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
