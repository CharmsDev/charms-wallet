'use client';

import { create } from 'zustand';
import { utxoService } from '@/services/utxo';
import { BLOCKCHAINS, NETWORKS } from './blockchainStore';
import { getCharms } from '@/services/storage';

const useUTXOStore = create((set, get) => ({
    utxos: {},
    isLoading: false,
    error: null,
    totalBalance: 0,
    refreshProgress: { processed: 0, total: 0, isRefreshing: false },
    initialized: false,
    cancelRefresh: false, // Flag to cancel ongoing refresh
    currentNetwork: null, // Track current network for change detection

    // Load UTXOs from localStorage
    loadUTXOs: async (blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) => {
        const state = get();

        // Check if network has changed - if so, clear existing UTXOs
        const networkKey = `${blockchain}-${network}`;
        console.log(`[UTXO STORE] Loading UTXOs for network: ${networkKey}`);
        console.log(`[UTXO STORE] Current network in state: ${state.currentNetwork}`);
        
        if (state.currentNetwork && state.currentNetwork !== networkKey) {
            console.log(`[UTXO STORE] Network changed from ${state.currentNetwork} to ${networkKey} - clearing UTXOs`);
            set({
                utxos: {},
                totalBalance: 0,
                initialized: false,
                error: null
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
            const storedUTXOs = await utxoService.getStoredUTXOs(blockchain, network);
            console.log(`[UTXO STORE] Loaded UTXOs from storage:`, Object.keys(storedUTXOs || {}).length, 'addresses');
            
            // Log sample addresses to verify network
            const sampleAddresses = Object.keys(storedUTXOs || {}).slice(0, 3);
            if (sampleAddresses.length > 0) {
                console.log(`[UTXO STORE] Sample addresses:`, sampleAddresses);
            }
            
            // Deduplicate per-address by txid:vout in case storage contains duplicates
            const deduped = {};
            Object.entries(storedUTXOs || {}).forEach(([addr, list]) => {
                const seen = new Set();
                deduped[addr] = (list || []).filter(u => {
                    const key = `${u.txid}:${u.vout}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
            });
            // Get charms to exclude from spendable balance
            const charms = await getCharms(blockchain, network) || [];
            const balance = utxoService.calculateSpendableBalance(deduped, charms);

            set({
                utxos: deduped,
                totalBalance: balance,
                isLoading: false,
                initialized: true
            });

        } catch (error) {
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
    refreshUTXOs: async (blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET, addressLimit = null, startOffset = 0) => {
        const state = get();

        if (state.refreshProgress.isRefreshing) {
            return;
        }

        try {
            set({
                error: null,
                refreshProgress: { processed: 0, total: 0, isRefreshing: true },
                cancelRefresh: false
            });


            // Keep existing UTXOs - only update per address, don't clear everything

            // Progress callback to update UTXOs dynamically
            const onProgress = (progressData) => {
                const currentState = get();
                const updatedUTXOs = { ...currentState.utxos };

                if (progressData.hasUtxos && progressData.utxos.length > 0) {
                    // Deduplicate by txid:vout to prevent duplicates across refresh cycles
                    const seen = new Set();
                    const deduped = [];
                    for (const utxo of progressData.utxos) {
                        const key = `${utxo.txid}:${utxo.vout}`;
                        if (!seen.has(key)) {
                            seen.add(key);
                            deduped.push(utxo);
                        }
                    }
                    updatedUTXOs[progressData.address] = deduped;
                } else {
                    delete updatedUTXOs[progressData.address];
                }

                // Use total balance for progress updates, will calculate spendable at the end
                const newBalance = utxoService.calculateTotalBalance(updatedUTXOs);

                set({
                    utxos: updatedUTXOs,
                    totalBalance: newBalance,
                    refreshProgress: {
                        processed: progressData.processed,
                        total: progressData.total,
                        isRefreshing: true
                    }
                });
            };

            await utxoService.fetchAndStoreAllUTXOsSequential(
                blockchain,
                network,
                onProgress,
                addressLimit,
                startOffset
            );

            // Final state update - use current UTXOs from progress updates
            const currentState = get();
            // Final deduplication pass across all addresses
            const finalUtxos = {};
            Object.entries(currentState.utxos || {}).forEach(([addr, list]) => {
                const seen = new Set();
                finalUtxos[addr] = (list || []).filter(u => {
                    const key = `${u.txid}:${u.vout}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
            });
            // Get charms to exclude from spendable balance
            const charms = await getCharms(blockchain, network) || [];
            const finalBalance = utxoService.calculateSpendableBalance(finalUtxos, charms);

            set({
                utxos: finalUtxos,
                totalBalance: finalBalance,
                refreshProgress: { processed: 0, total: 0, isRefreshing: false }
            });


        } catch (error) {
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
            return [];
        }
    },

    // Update UTXOs after a transaction
    updateAfterTransaction: async (spentUtxos, newUtxos = {}, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) => {
        try {
            const updatedUTXOs = await utxoService.updateAfterTransaction(spentUtxos, newUtxos, blockchain, network);
            // Get charms to exclude from spendable balance
            const charms = await getCharms(blockchain, network) || [];
            const newBalance = utxoService.calculateSpendableBalance(updatedUTXOs, charms);

            set({
                utxos: updatedUTXOs,
                totalBalance: newBalance
            });

            return updatedUTXOs;
        } catch (error) {
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
    },

    cancelUTXORefresh: () => {
        utxoService.cancelOperations();

        set({
            cancelRefresh: true,
            refreshProgress: { processed: 0, total: 0, isRefreshing: false }
        });
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
