'use client';

import { create } from 'zustand';
import { utxoService } from '@/services/utxo';
import { BLOCKCHAINS, NETWORKS } from './blockchainStore';

const useUTXOStore = create((set, get) => ({
    utxos: {},
    isLoading: false,
    error: null,
    totalBalance: 0,
    refreshProgress: { processed: 0, total: 0, isRefreshing: false },
    initialized: false,

    // Load UTXOs from localStorage
    loadUTXOs: async (blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) => {
        const state = get();

        // Prevent multiple simultaneous loads
        if (state.isLoading) {
            return;
        }

        set({ isLoading: true, error: null });

        try {
            console.log(`[UTXO STORE] Loading UTXOs for ${blockchain}-${network}`);

            const storedUTXOs = await utxoService.getStoredUTXOs(blockchain, network);
            const balance = utxoService.calculateTotalBalance(storedUTXOs);

            set({
                utxos: storedUTXOs,
                totalBalance: balance,
                isLoading: false,
                initialized: true
            });

            console.log(`[UTXO STORE] Loaded ${Object.keys(storedUTXOs).length} addresses with UTXOs, balance: ${balance}`);
        } catch (error) {
            console.error('Failed to load UTXOs:', error);
            set({
                error: 'Failed to load UTXOs',
                utxos: {},
                totalBalance: 0,
                isLoading: false,
                initialized: true
            });
        }
    },

    // Refresh UTXOs from API and store them
    refreshUTXOs: async (blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) => {
        const state = get();

        if (state.refreshProgress.isRefreshing) {
            return;
        }

        try {
            set({
                error: null,
                refreshProgress: { processed: 0, total: 0, isRefreshing: true }
            });

            console.log(`[UTXO STORE] Refreshing UTXOs for ${blockchain}-${network}`);

            // Progress callback to update UTXOs dynamically
            const onProgress = (progressData) => {
                set({
                    refreshProgress: {
                        processed: progressData.processed,
                        total: progressData.total,
                        isRefreshing: true
                    }
                });

                // Update UTXOs immediately when new ones are found
                if (progressData.hasUtxos && progressData.utxos.length > 0) {
                    const currentState = get();
                    const updatedUTXOs = {
                        ...currentState.utxos,
                        [progressData.address]: progressData.utxos
                    };
                    const newBalance = utxoService.calculateTotalBalance(updatedUTXOs);

                    set({
                        utxos: updatedUTXOs,
                        totalBalance: newBalance
                    });
                }
            };

            const fetchedUTXOs = await utxoService.fetchAndStoreAllUTXOsSequential(
                blockchain,
                network,
                onProgress
            );

            const finalBalance = utxoService.calculateTotalBalance(fetchedUTXOs);

            set({
                utxos: fetchedUTXOs,
                totalBalance: finalBalance,
                refreshProgress: { processed: 0, total: 0, isRefreshing: false }
            });

            console.log(`[UTXO STORE] Refresh completed, final balance: ${finalBalance}`);

        } catch (error) {
            console.error('Failed to refresh UTXOs:', error);
            set({
                error: 'Failed to refresh UTXOs: ' + error.message,
                refreshProgress: { processed: 0, total: 0, isRefreshing: false }
            });
        }
    },

    // Get UTXOs for a specific address
    getAddressUTXOs: async (address, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) => {
        try {
            return await utxoService.getAddressUTXOs(address, blockchain, network);
        } catch (error) {
            console.error('Failed to get address UTXOs:', error);
            return [];
        }
    },

    // Update UTXOs after a transaction
    updateAfterTransaction: async (spentUtxos, newUtxos = {}, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) => {
        try {
            const updatedUTXOs = await utxoService.updateAfterTransaction(spentUtxos, newUtxos, blockchain, network);
            const newBalance = utxoService.calculateTotalBalance(updatedUTXOs);

            set({
                utxos: updatedUTXOs,
                totalBalance: newBalance
            });

            return updatedUTXOs;
        } catch (error) {
            console.error('Failed to update UTXOs after transaction:', error);
            throw error;
        }
    },

    // Format value based on blockchain
    formatValue: (value, blockchain = BLOCKCHAINS.BITCOIN) => {
        if (blockchain === BLOCKCHAINS.BITCOIN) {
            return utxoService.formatSats(value);
        } else if (blockchain === BLOCKCHAINS.CARDANO) {
            // Format ADA (1 ADA = 1,000,000 lovelace)
            return (value / 1000000).toFixed(6) + ' ADA';
        }
        return value.toString();
    },

    // Clear UTXOs
    clearUTXOs: () => {
        set({
            utxos: {},
            totalBalance: 0,
            error: null,
            refreshProgress: { processed: 0, total: 0, isRefreshing: false },
            initialized: false
        });
    },

    // Reset error state
    clearError: () => {
        set({ error: null });
    }
}));

export const useUTXOs = () => {
    const state = useUTXOStore();
    return state;
};

// For backward compatibility, export a provider that doesn't do anything
export function UTXOProvider({ children }) {
    return children;
}
