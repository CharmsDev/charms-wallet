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


    // Re-classify and enrich transactions in storage. Confirmed entries that
    // already carry full vin/vout are skipped (immutable) so refreshes stay
    // cheap. New entries (added by transactions-sync) get vin/vout fetched
    // once via the decoded-tx helper, then re-classified with the proper
    // address context.
    reprocessCharmTransactions: async (blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET, addresses = []) => {
        try {
            const { getTransactions, saveTransactions, getAddresses } = await import('@/services/storage');
            const { extractCharmTokenData } = await import('@/services/transactions/charm-transaction-extractor');
            const { classifyTransaction, CHARM_TRANSACTION_TYPES } = await import('@/services/transactions/transaction-classifier');
            const { explorerWalletService } = await import('@/services/shared/explorer-wallet-service');

            // Load addresses from storage if caller didn't supply them — the
            // classifier needs an `ownSet` to detect charm/beam patterns. An
            // empty ownSet would silently default everything to RECEIVED/SENT.
            const effectiveAddresses = (addresses && addresses.length > 0)
                ? addresses
                : await getAddresses(blockchain, network);

            const transactions = await getTransactions(blockchain, network);
            const ownAddrs = new Set(effectiveAddresses.map(a => a.address || a).filter(Boolean));
            console.log(`[reprocess] addrs=${ownAddrs.size} txs=${transactions.length}`);

            // Tx is fully populated if it has both inputs and outputs with
            // at least one resolved address — those are confirmed-on-chain
            // and never change.
            const hasFullData = (tx) => {
                if (!tx.inputs?.length || !tx.outputs?.length) return false;
                const anyInputAddr = tx.inputs.some(i => i.address);
                const anyOutputAddr = tx.outputs.some(o => o.address || o.isOpReturn);
                return anyInputAddr && anyOutputAddr;
            };

            // Diagnostics — quantify what's happening so we can see if
            // classification is failing because of decoder 404s, empty
            // ownSet, or the classifier itself.
            let decodedOk = 0, decodedFail = 0, classified = 0, kept = 0;
            const sampleFails = [];

            // PASS 1 — decode missing vin/vout, classify only when we have
            // data. Otherwise keep the indexer-provided type.
            const decoded = await Promise.all(transactions.map(async (tx) => {
                const beforeType = tx.type;
                if (!hasFullData(tx)) {
                    const d = await explorerWalletService.getDecodedTransaction(tx.txid, network).catch(() => null);
                    if (d?.outputs?.length) {
                        tx.inputs = d.inputs;
                        tx.outputs = d.outputs;
                        tx.fee = d.fee || tx.fee;
                        const inFromUs = tx.inputs.reduce((s, i) =>
                            s + (ownAddrs.has(i.address) ? (i.value || 0) : 0), 0);
                        const outToUs = tx.outputs.reduce((s, o) =>
                            s + (ownAddrs.has(o.address) ? (o.amount || 0) : 0), 0);
                        const delta = outToUs - inFromUs;
                        if (delta !== 0) tx.amount = Math.abs(delta);
                        decodedOk++;
                    } else {
                        decodedFail++;
                        if (sampleFails.length < 3) sampleFails.push(tx.txid.slice(0, 12));
                    }
                }
                if (hasFullData(tx)) {
                    tx.type = classifyTransaction(tx, effectiveAddresses, { placeholderTxids: new Set() });
                    classified++;
                } else {
                    kept++;
                }
                return tx;
            }));

            console.log(`[reprocess:p1] decoded=${decodedOk} decodeFail=${decodedFail} classified=${classified} keptIndexerType=${kept}${sampleFails.length ? ` sampleFails=${sampleFails.join(',')}…` : ''}`);

            // Build placeholder set from Pass 1 — these are the BTC_PLACEHOLDER
            // outputs that beam-in claim txs reference as their input.
            const placeholderTxids = new Set(
                decoded.filter(t => t.type === 'btc_placeholder').map(t => t.txid)
            );

            // PASS 2 — reclassify with placeholderTxids known. Only needed
            // for txs that came back as CHARM_RECEIVED/CHARM_SENT in Pass 1
            // (those are the ones that can flip to BEAM_IN/BEAM_OUT).
            const updatedTransactions = await Promise.all(decoded.map(async (tx) => {
                if (placeholderTxids.size > 0 && hasFullData(tx)) {
                    tx.type = classifyTransaction(tx, effectiveAddresses, { placeholderTxids });
                }

                // Charm metadata: only fetch if we don't already have it
                // (set null after one attempt; absence (undefined) means
                // "never tried").
                if (tx.charmTokenData === undefined && CHARM_TRANSACTION_TYPES.has(tx.type)) {
                    const charmData = await extractCharmTokenData(tx.txid, network, effectiveAddresses).catch(() => null);
                    tx.charmTokenData = charmData ? {
                        appId: charmData.appId,
                        tokenName: charmData.tokenName,
                        tokenTicker: charmData.tokenTicker,
                        tokenImage: charmData.tokenImage,
                        tokenAmount: charmData.tokenAmount,
                    } : null;
                    delete tx.metadata; // legacy field — superseded by charmTokenData
                }
                return tx;
            }));

            // Dedupe by txid — the last entry wins (assumed freshest).
            const txidMap = new Map();
            for (const tx of updatedTransactions) txidMap.set(tx.txid, tx);
            const deduplicatedTransactions = Array.from(txidMap.values());
            
            await saveTransactions(deduplicatedTransactions, blockchain, network);

            // Type distribution after both passes — the answer to "why is
            // everything 'Received Bitcoin'?" lives here.
            const dist = {};
            for (const tx of deduplicatedTransactions) {
                dist[tx.type] = (dist[tx.type] || 0) + 1;
            }
            const distStr = Object.entries(dist)
                .sort((a, b) => b[1] - a[1])
                .map(([t, n]) => `${t}=${n}`)
                .join(' ');
            console.log(`[reprocess] total=${deduplicatedTransactions.length} types: ${distStr}`);
        } catch (error) {
            console.error(`[reprocess] error: ${error.message}`);
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
