/**
 * Charms Store (Zustand)
 * Manages charm state with inline utilities
 */

import { create } from 'zustand';
import { getCharms, saveCharms } from '@/services/storage';
import charmsExplorerAPI from '@/services/charms/charms-explorer-api';

// ============================================
// Helper Functions (inline)
// ============================================

const isNFT = (charm) => {
    return charm.type === 'nft' || (charm.amount === undefined || charm.amount === null);
};

const isToken = (charm) => {
    return charm.type === 'token' || (charm.amount !== undefined && charm.amount !== null);
};

const getCharmKey = (charm) => {
    return `${charm.txid}-${charm.outputIndex}`;
};

const extractAmount = (charm) => {
    // If displayAmount exists (already converted), use it
    if (charm.displayAmount !== undefined && charm.displayAmount !== null) {
        return Number(charm.displayAmount) || 0;
    }
    
    // Extract raw amount
    let rawAmount = 0;
    if (charm && typeof charm.amount === 'object' && charm.amount !== null) {
        rawAmount = charm.amount?.remaining ?? 0;
    } else {
        rawAmount = charm?.amount ?? 0;
    }
    
    // Convert using decimals if available
    const decimals = charm.decimals || charm.amount?.decimals || 0;
    const displayAmount = decimals > 0 ? rawAmount / Math.pow(10, decimals) : rawAmount;
    
    return Number(displayAmount) || 0;
};

const getDisplayName = (charm) => {
    if (charm.name) return charm.name;
    if (charm.metadata?.name) return charm.metadata.name;
    if (charm.ticker) return charm.ticker;
    if (charm.metadata?.ticker) return charm.metadata.ticker;
    const shortTxid = charm.txid ? charm.txid.substring(0, 8) : 'unknown';
    return `Charm ${shortTxid}`;
};

// ============================================
// Zustand Store
// ============================================

export const useCharmsStore = create((set, get) => ({
    // State
    charms: [],
    isLoading: false,
    error: null,
    initialized: false,
    currentNetwork: null,

    // Actions
    setCharms: (charms) => set({ charms }),
    setLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),

    /**
     * Initialize from cache
     */
    initialize: async (blockchain, network) => {
        const networkKey = `${blockchain}-${network}`;
        const state = get();
        
        console.log(`📥 [CharmsStore.initialize] Called for ${networkKey}`);
        console.log(`   └─ Current network: ${state.currentNetwork}`);
        console.log(`   └─ Initialized: ${state.initialized}`);
        console.log(`   └─ Current charms: ${state.charms.length}`);
        
        // Network changed - clear and reinitialize
        if (state.currentNetwork && state.currentNetwork !== networkKey) {
            console.log(`   └─ Network changed, clearing charms`);
            set({ charms: [], initialized: false, currentNetwork: networkKey });
        } else if (state.initialized && state.currentNetwork === networkKey) {
            // Already initialized for this network - skip reload
            console.log(`   └─ Already initialized, skipping reload`);
            return;
        } else {
            // First initialization for this network
            console.log(`   └─ First initialization for this network`);
            set({ currentNetwork: networkKey });
        }
        
        try {
            const cachedCharms = await getCharms(blockchain, network);
            console.log(`   └─ Loaded from localStorage: ${cachedCharms?.length || 0} charms`);
            
            if (cachedCharms && cachedCharms.length > 0) {
                const enhanced = await charmsExplorerAPI.processCharmsWithReferenceData(cachedCharms);
                console.log(`   └─ Enhanced charms: ${enhanced.length}`);
                console.log(`   └─ Setting in store...`);
                set({ charms: enhanced, initialized: true });
                
                try {
                    await saveCharms(enhanced, blockchain, network);
                } catch (e) {
                    // Silent fail on cache save
                }
            } else {
                console.log(`   └─ No cached charms, marking as initialized`);
                set({ initialized: true });
            }
        } catch (error) {
            console.error(`   └─ Error initializing:`, error);
            set({ error: error.message, initialized: true });
        }
    },

    /**
     * Add charm progressively (with deduplication)
     */
    addCharm: async (charm) => {
        const enhanced = await charmsExplorerAPI.processCharmsWithReferenceData([charm]);
        
        set((state) => {
            const filtered = state.charms.filter(c => 
                !enhanced.some(newC => getCharmKey(c) === getCharmKey(newC))
            );
            return { charms: [...filtered, ...enhanced] };
        });
    },

    /**
     * Remove charm after transfer
     */
    removeCharm: (utxo) => {
        set((state) => ({
            charms: state.charms.filter(c => 
                !(c.txid === utxo.txid && c.outputIndex === utxo.vout)
            )
        }));
    },

    /**
     * Clear all charms
     */
    clear: () => set({ charms: [], initialized: false }),

    // ============================================
    // Selectors (computed values)
    // ============================================

    /**
     * Get total balance for specific token by appId
     */
    getTotalByAppId: (appId) => {
        const state = get();
        return state.charms
            .filter(charm => isToken(charm) && charm.appId === appId)
            .reduce((total, charm) => total + extractAmount(charm), 0);
    },

    /**
     * Group tokens by appId
     */
    groupTokensByAppId: () => {
        const state = get();
        const tokenGroups = {};

        state.charms.forEach(charm => {
            if (!isToken(charm)) return;

            const appId = charm.appId;
            if (!tokenGroups[appId]) {
                tokenGroups[appId] = {
                    appId,
                    name: charm.name || charm.metadata?.name || getDisplayName(charm),
                    ticker: charm.ticker || charm.metadata?.ticker || charm.amount?.ticker || '',
                    image: charm.image || charm.metadata?.image,
                    description: charm.description || charm.metadata?.description || '',
                    url: charm.url || charm.metadata?.url || null,
                    totalAmount: 0,
                    tokenUtxos: []
                };
            }

            tokenGroups[appId].totalAmount += extractAmount(charm);
            tokenGroups[appId].tokenUtxos.push(charm);
        });

        return Object.values(tokenGroups);
    },

    /**
     * Get all NFTs
     */
    getNFTs: () => {
        const state = get();
        return state.charms.filter(isNFT);
    },

    /**
     * Type checkers
     */
    isCharmNFT: (charm) => isNFT(charm),
    isCharmToken: (charm) => isToken(charm),

    /**
     * Display helpers
     */
    getCharmDisplayName: (charm) => getDisplayName(charm)
}));
