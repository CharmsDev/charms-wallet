'use client';

import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { charmsService } from '@/services/charms/charms';
import charmsExplorerAPI from '@/services/charms/charms-explorer-api';
import { useUTXOs } from './utxoStore';
import { useBlockchain } from './blockchainStore';
import { getCharms, saveCharms } from '@/services/storage';

const CharmsContext = createContext();

export const useCharms = () => {
    const context = useContext(CharmsContext);
    if (!context) {
        throw new Error('useCharms must be used within a CharmsProvider');
    }
    return context;
};

export function CharmsProvider({ children }) {
    const [charms, setCharms] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [initialized, setInitialized] = useState(false);
    const [currentNetwork, setCurrentNetwork] = useState(null);
    const [loadingProgress, setLoadingProgress] = useState({ current: 0, total: 0 });
    const fetchPromiseRef = useRef(null);
    const lastFetchRef = useRef({ sig: null, at: 0 });
    const { utxos } = useUTXOs();
    const { activeNetwork, activeBlockchain } = useBlockchain();

    // Load charms from cache on network change
    useEffect(() => {
        const networkKey = `${activeBlockchain}-${activeNetwork}`;
        
        // If network changed, clear and reload
        if (currentNetwork && currentNetwork !== networkKey) {
            setCharms([]);
            setInitialized(false);
        }
        
        setCurrentNetwork(networkKey);
        
        // Load from cache first for instant display
        if (!initialized) {
            loadCharmsFromCache();
        }
    }, [activeNetwork, activeBlockchain]);

    // After cache initialization: if we have UTXOs but no charms in cache, fetch from API
    useEffect(() => {
        // Only trigger when cache has been checked, not currently loading, and charms are empty
        if (initialized && !isLoading && charms.length === 0 && Object.keys(utxos).length > 0) {
            loadCharms(false);
        }
    }, [initialized, isLoading, charms.length, utxos, activeNetwork, activeBlockchain]);

    // Load charms from localStorage cache
    const loadCharmsFromCache = async () => {
        try {
            const cachedCharms = await getCharms(activeBlockchain, activeNetwork);
            
            if (cachedCharms && cachedCharms.length > 0) {
                // Enhance cached charms with reference NFT data
                const enhancedCharms = await charmsExplorerAPI.processCharmsWithReferenceData(cachedCharms);
                setCharms(enhancedCharms);
                // Persist corrected/enhanced charms so subsequent reloads (e.g., dashboard) see fixed amounts
                try {
                    await saveCharms(enhancedCharms, activeBlockchain, activeNetwork);
                } catch (e) {
                    console.warn('[CHARMS] Failed to save enhanced cached charms', e);
                }
            }
            setInitialized(true);
        } catch (error) {
            console.warn('[CHARMS] Failed to load from cache:', error);
            setInitialized(true);
        }
    };

    // Add charm progressively as they are processed (with deduplication)
    const addCharm = async (charm) => {
        const enhancedCharm = await charmsExplorerAPI.processCharmsWithReferenceData([charm]);
        setCharms(prevCharms => {
            // Create a unique key for each charm based on txid and outputIndex
            const getCharmKey = (c) => `${c.txid}-${c.outputIndex}`;
            
            // Check if this charm already exists
            const existingKeys = new Set(prevCharms.map(getCharmKey));
            const newCharmsToAdd = enhancedCharm.filter(c => !existingKeys.has(getCharmKey(c)));
            
            if (newCharmsToAdd.length === 0) {
                return prevCharms; // No new charms to add
            }
            const newCharms = [...prevCharms, ...newCharmsToAdd];
            
            // Save to cache progressively
            saveCharms(newCharms, activeBlockchain, activeNetwork).catch(e => 
                console.warn('[CHARMS] Failed to save progressive charms', e)
            );
            return newCharms;
        });
    };

    // Load charms progressively from API
    const loadCharms = async (forceRefresh = false) => {
        // If no UTXOs available, skip
        if (Object.keys(utxos).length === 0) return;

        // Compute a short-lived fetch signature to avoid refetching for the same inputs
        const txIds = Array.from(new Set(Object.values(utxos).flat().map(u => u.txid))).sort();
        const sig = `${activeBlockchain}-${activeNetwork}:${txIds.join(',')}`;
        const now = Date.now();

        // If not forcing refresh and we recently fetched the same signature, skip (30s)
        if (!forceRefresh && lastFetchRef.current.sig === sig && (now - lastFetchRef.current.at) < 30000) {
            return fetchPromiseRef.current || undefined;
        }

        // If a fetch is already in-flight for this signature, reuse it
        if (fetchPromiseRef.current && isLoading) {
            return fetchPromiseRef.current;
        }

        const run = async () => {
            try {
                setIsLoading(true);
                setError(null);
                setLoadingProgress({ current: 0, total: txIds.length });
                
                // Clear existing charms when starting fresh load
                if (forceRefresh) {
                    setCharms([]);
                }
                
                const charmsNetwork = activeNetwork === 'testnet4' ? 'testnet4' : 'mainnet';
                
                // Process charms progressively using the new service method
                await charmsService.getCharmsByUTXOsProgressive(
                    utxos, 
                    charmsNetwork,
                    addCharm,
                    (current, total) => setLoadingProgress({ current, total })
                );
                
            } catch (error) {
                console.error('[CHARMS] Failed to load charms:', error);
                setError('Failed to load charms');
            } finally {
                setIsLoading(false);
                setLoadingProgress({ current: 0, total: 0 });
                lastFetchRef.current = { sig, at: Date.now() };
                fetchPromiseRef.current = null;
            }
        };

        fetchPromiseRef.current = run();
        return fetchPromiseRef.current;
    };

    const refreshCharms = async () => {
        try {
            // Force refresh to bypass cache and re-enhance amounts
            await loadCharms(true);
            } catch (e) {
            console.warn('[CHARMS] Refresh failed', e);
        }
    };

    const isNFT = (charm) => {
        return charmsService.isNFT(charm);
    };

    const getCharmDisplayName = (charm) => {
        return charmsService.getCharmDisplayName(charm);
    };

    const value = {
        charms,
        isLoading,
        error,
        initialized,
        loadingProgress,
        loadCharms,
        refreshCharms,
        isNFT,
        getCharmDisplayName
    };

    return <CharmsContext.Provider value={value}>{children}</CharmsContext.Provider>;
}
