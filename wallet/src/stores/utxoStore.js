'use client';

import { create } from 'zustand';
import { utxoService } from '@/services/utxo';
import { getCharms, getBalance, saveUTXOs } from '@/services/storage';
import { BLOCKCHAINS, NETWORKS } from './blockchainStore';

const useUTXOStore = create((set, get) => ({
    utxos: {},
    isLoading: false,
    error: null,
    totalBalance: 0,
    pendingBalance: 0,
    refreshProgress: { processed: 0, total: 0, isRefreshing: false },
    initialized: false,
    cancelRefresh: false, // Flag to cancel ongoing refresh
    currentNetwork: null, // Track current network for change detection

    // Load UTXOs from localStorage
    loadUTXOs: async (blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) => {
        const state = get();

        // Check if network has changed - if so, clear existing UTXOs
        const networkKey = `${blockchain}-${network}`;
        
        if (state.currentNetwork && state.currentNetwork !== networkKey) {
            set({
                utxos: {},
                totalBalance: 0,
                pendingBalance: 0,
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
            const storedUTXOs = await utxoService.getStoredUTXOsRaw(blockchain, network);
            
            // Filter by network prefix and deduplicate UTXOs
            const networkPrefix = network === 'mainnet' ? 'bc1' : 'tb1';
            const deduped = {};
            Object.entries(storedUTXOs || {}).forEach(([addr, list]) => {
                if (!addr.startsWith(networkPrefix)) {
                    return;
                }
                
                const seen = new Set();
                deduped[addr] = (list || []).filter(u => {
                    const key = `${u.txid}:${u.vout}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
            });
            
            // Update storage if addresses were filtered
            const originalAddressCount = Object.keys(storedUTXOs || {}).length;
            const cleanedAddressCount = Object.keys(deduped).length;
            if (originalAddressCount !== cleanedAddressCount) {
                await saveUTXOs(deduped, blockchain, network);
            }
            
            // Load balance from cache if available (unified structure)
            const storedBalance = getBalance(blockchain, network);
            
            if (storedBalance) {
                // Use new unified structure
                set({
                    utxos: deduped,
                    totalBalance: storedBalance.bitcoin?.spendable || 0,
                    pendingBalance: storedBalance.bitcoin?.pending || 0,
                    isLoading: false,
                    initialized: true
                });
            } else {
                // Calculate balance if not in cache (fallback)
                const charms = await getCharms(blockchain, network) || [];
                const balanceData = utxoService.calculateBalances(deduped, charms);
                
                // Save calculated balance to localStorage (will be converted to unified structure)
                saveBalance(blockchain, network, {
                    spendable: balanceData.spendable,
                    pending: balanceData.pending,
                    nonSpendable: balanceData.nonSpendable,
                    utxoCount: Object.values(deduped).reduce((sum, list) => sum + list.length, 0),
                    charmCount: charms.length,
                    ordinalCount: 0,
                    runeCount: 0,
                    tokens: []
                });
                
                set({
                    utxos: deduped,
                    totalBalance: balanceData.spendable,
                    pendingBalance: balanceData.pending,
                    isLoading: false,
                    initialized: true
                });
            }

        } catch (error) {
            set({
                error: `Failed to load UTXOs: ${error.message}`,
                utxos: {},
                totalBalance: 0,
                pendingBalance: 0,
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
                refreshProgress: { 
                    processed: 0, 
                    total: 0, 
                    isRefreshing: true 
                },
                cancelRefresh: false
            });

            // Progress callback to update UTXOs dynamically
            const onProgress = (progressData) => {
                const currentState = get();
                const updatedUTXOs = { ...currentState.utxos };

                // CRITICAL: Set difference logic
                // Compare QuickNode UTXOs vs localStorage UTXOs for this address
                const fromQuickNode = progressData.utxos || [];
                const fromLocalStorage = updatedUTXOs[progressData.address] || [];
                
                console.log(`\n📊 [UTXOStore] ===== PROCESSING ADDRESS: ${progressData.address.slice(0, 15)}... =====`);
                console.log(`📦 [UTXOStore] QuickNode UTXOs (${fromQuickNode.length}):`, 
                    fromQuickNode.map(u => `${u.txid.slice(0, 8)}:${u.vout}`));
                console.log(`💾 [UTXOStore] localStorage UTXOs (${fromLocalStorage.length}):`, 
                    fromLocalStorage.map(u => `${u.txid.slice(0, 8)}:${u.vout}`));
                
                if (fromQuickNode.length > 0) {
                    // Create a map of QuickNode UTXOs by txid:vout
                    const quickNodeMap = new Map();
                    fromQuickNode.forEach(utxo => {
                        const key = `${utxo.txid}:${utxo.vout}`;
                        quickNodeMap.set(key, utxo);
                    });
                    
                    // Keep UTXOs that exist in QuickNode (update or keep existing)
                    const finalUtxos = [];
                    const processedKeys = new Set();
                    
                    // First: Update existing UTXOs or keep them if they're in QuickNode
                    fromLocalStorage.forEach(localUtxo => {
                        const key = `${localUtxo.txid}:${localUtxo.vout}`;
                        if (quickNodeMap.has(key)) {
                            // UTXO still exists - use QuickNode data (fresher)
                            finalUtxos.push(quickNodeMap.get(key));
                            processedKeys.add(key);
                        }
                        // If not in QuickNode, it's spent - don't add it
                    });
                    
                    // Second: Add new UTXOs from QuickNode that weren't in localStorage
                    fromQuickNode.forEach(qnUtxo => {
                        const key = `${qnUtxo.txid}:${qnUtxo.vout}`;
                        if (!processedKeys.has(key)) {
                            finalUtxos.push(qnUtxo);
                        }
                    });
                    
                    updatedUTXOs[progressData.address] = finalUtxos;
                    
                    console.log(`✅ [UTXOStore] Final UTXOs (${finalUtxos.length}):`, 
                        finalUtxos.map(u => `${u.txid.slice(0, 8)}:${u.vout}`));
                    console.log(`📊 [UTXOStore] Summary - QN: ${fromQuickNode.length}, Local: ${fromLocalStorage.length}, Final: ${finalUtxos.length}`);
                } else {
                    // QuickNode returned empty - all UTXOs for this address are spent
                    if (fromLocalStorage.length > 0) {
                        console.log(`[UTXOStore] Address ${progressData.address.slice(0, 10)}... - Removing ${fromLocalStorage.length} spent UTXOs`);
                    }
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
            // Get charms to exclude from balances
            const charms = await getCharms(blockchain, network) || [];
            const balanceData = utxoService.calculateBalances(finalUtxos, charms);

            // Note: Balance is saved by wallet-sync-service.js (unified structure)
            // This store only updates memory state

            set({
                utxos: finalUtxos,
                totalBalance: balanceData.spendable,
                pendingBalance: balanceData.pending,
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
            // Get charms to exclude from balances
            const charms = await getCharms(blockchain, network) || [];
            const balanceData = utxoService.calculateBalances(updatedUTXOs, charms);

            // Note: Balance is saved by wallet-sync-service.js after transaction (unified structure)
            // This store only updates memory state

            set({
                utxos: updatedUTXOs,
                totalBalance: balanceData.spendable,
                pendingBalance: balanceData.pending
            });

            return updatedUTXOs;
        } catch (error) {
            throw error;
        }
    },

    // Refresh specific addresses only (optimized for post-transfer updates)
    refreshSpecificAddresses: async (addresses, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) => {
        try {
            if (!addresses || addresses.length === 0) {
                return;
            }

            // Validate that addresses belong to this wallet
            const { getAddresses } = await import('@/services/storage');
            const walletAddresses = await getAddresses(blockchain, network);
            const validAddressSet = new Set(walletAddresses.map(addr => addr.address));
            
            const validAddresses = addresses.filter(addr => validAddressSet.has(addr));

            if (validAddresses.length === 0) {
                return;
            }

            // Fetch UTXOs for specific addresses
            const newUtxos = await utxoService.getMultipleAddressesUTXOs(validAddresses, blockchain, network);
            
            // Merge with existing UTXOs
            const state = get();
            const updatedUTXOs = { ...state.utxos };
            
            // Update only the specified addresses
            addresses.forEach(address => {
                if (newUtxos[address] && newUtxos[address].length > 0) {
                    updatedUTXOs[address] = newUtxos[address];
                } else {
                    delete updatedUTXOs[address];
                }
            });

            // Save to storage
            await saveUTXOs(updatedUTXOs, blockchain, network);

            // Recalculate balances
            const charms = await getCharms(blockchain, network) || [];
            const balanceData = utxoService.calculateBalances(updatedUTXOs, charms);
            
            // Note: Balance is saved by wallet-sync-service.js (unified structure)
            // This store only updates memory state

            set({
                utxos: updatedUTXOs,
                totalBalance: balanceData.spendable,
                pendingBalance: balanceData.pending
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
            pendingBalance: 0,
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

// Export the store directly for components that need it
export { useUTXOStore };

// For backward compatibility, export a provider that doesn't do anything
export function UTXOProvider({ children }) {
    return children;
}
