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
    pendingCharms: [], // Pending charms waiting for confirmation
    isLoading: false,
    error: null,
    initialized: false,
    currentNetwork: null,

    // Actions
    setCharms: (charms) => set({ charms }),
    setLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),

    /**
     * Initialize charms state from local cache.
     *
     * Previously, this awaited `processCharmsWithReferenceData` before calling
     * `set()`. When that helper fires off N reference-NFT lookups, it can take
     * seconds — and if the user clicks Refresh in the meantime, the fresh
     * sync's `applyResults` finishes first, then this function's trailing
     * `set` silently clobbers the fresh data with the stale cache.
     *
     * The fix has three parts:
     *   1. Drop cached charms that don't have the minimum shape — avoids
     *      propagating legacy/corrupt entries from older wallet versions.
     *   2. Publish the cache synchronously (no metadata enrichment yet) so
     *      the UI paints immediately.
     *   3. Run the metadata enrichment in the background, and BEFORE writing
     *      re-check that no fresher data has been set in the meantime.
     */
    initialize: async (blockchain, network) => {
        const networkKey = `${blockchain}-${network}`;
        const state = get();

        // Network changed — clear and reinitialize
        if (state.currentNetwork && state.currentNetwork !== networkKey) {
            set({ charms: [], pendingCharms: [], initialized: false, currentNetwork: networkKey });
        } else if (state.initialized && state.currentNetwork === networkKey) {
            // Already initialized for this network — skip reload
            return;
        } else {
            set({ currentNetwork: networkKey });
        }

        try {
            const cachedCharms = await getCharms(blockchain, network);
            // Sanitize: a charm must have txid + outputIndex + a usable appId.
            // Anything missing these is stale shape from a previous version.
            const clean = (cachedCharms || []).filter(c =>
                c && c.txid && (c.outputIndex !== undefined && c.outputIndex !== null) &&
                (c.appId || c.app_id)
            );

            if (clean.length === 0) {
                set({ initialized: true });
                return;
            }

            // Step 1: publish cached data immediately so the UI has something
            // to render before the sync arrives. This is safe — cache is the
            // source of truth until sync overrides it.
            set({ charms: clean, initialized: true });

            // Step 2: enrich with reference-NFT metadata asynchronously.
            // DO NOT block on this. Guard the write so a concurrent sync
            // (which calls setState with fresh charms) wins the race.
            charmsExplorerAPI.processCharmsWithReferenceData(clean)
                .then((enhanced) => {
                    const current = get();
                    // Abort if network changed mid-flight or the store already
                    // holds fresher-looking data (more charms = likely from sync).
                    if (current.currentNetwork !== networkKey) return;
                    if (current.charms.length > enhanced.length) return;
                    set({ charms: enhanced });
                    saveCharms(enhanced, blockchain, network).catch(() => {});
                })
                .catch(() => { /* enrichment is best-effort */ });
        } catch (error) {
            console.error('[CharmsStore] Error initializing:', error);
            set({ error: error.message, initialized: true });
        }
    },

    /**
     * Add charm progressively (with deduplication)
     * Also removes matching pending charm if found
     */
    addCharm: async (charm) => {
        const enhanced = await charmsExplorerAPI.processCharmsWithReferenceData([charm]);
        
        set((state) => {
            const filtered = state.charms.filter(c => 
                !enhanced.some(newC => getCharmKey(c) === getCharmKey(newC))
            );
            
            // Remove matching pending charms (now confirmed)
            const updatedPending = state.pendingCharms.filter(p => 
                !enhanced.some(newC => p.txid === newC.txid && p.outputIndex === newC.outputIndex)
            );
            
            return { 
                charms: [...filtered, ...enhanced],
                pendingCharms: updatedPending
            };
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
    clear: () => set({ charms: [], pendingCharms: [], initialized: false }),

    /**
     * Add pending charm (expected change from transfer)
     */
    addPendingCharm: (pendingCharm) => {
        set((state) => ({
            pendingCharms: [...state.pendingCharms, {
                ...pendingCharm,
                isPending: true,
                createdAt: Date.now()
            }]
        }));
    },

    /**
     * Remove pending charm (when confirmed or timeout)
     */
    removePendingCharm: (txid, outputIndex) => {
        set((state) => ({
            pendingCharms: state.pendingCharms.filter(c => 
                !(c.txid === txid && c.outputIndex === outputIndex)
            )
        }));
    },

    /**
     * Clear old pending charms (older than 10 minutes)
     */
    clearOldPendingCharms: () => {
        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
        set((state) => ({
            pendingCharms: state.pendingCharms.filter(c => c.createdAt > tenMinutesAgo)
        }));
    },

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
     * Get pending balance for specific token by appId
     */
    getPendingByAppId: (appId) => {
        const state = get();
        return state.pendingCharms
            .filter(charm => charm.appId === appId)
            .reduce((total, charm) => total + (charm.amount || 0), 0);
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
