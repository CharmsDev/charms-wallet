'use client';

import { createContext, useContext, useState, useEffect } from 'react';
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

    // Load charms from localStorage cache
    const loadCharmsFromCache = async () => {
        try {
            const cachedCharms = await getCharms(activeBlockchain, activeNetwork);
            
            if (cachedCharms && cachedCharms.length > 0) {
                // Enhance cached charms with reference NFT data
                const enhancedCharms = await charmsExplorerAPI.processCharmsWithReferenceData(cachedCharms);
                setCharms(enhancedCharms);
                console.log(`[CHARMS] Loaded ${enhancedCharms.length} charms from cache (enhanced with reference data)`);
            }
            setInitialized(true);
        } catch (error) {
            console.warn('[CHARMS] Failed to load from cache:', error);
            setInitialized(true);
        }
    };

    // Load charms from API and cache them
    const loadCharms = async (forceRefresh = false) => {
        // If already loading or no UTXOs available, skip
        if (isLoading || Object.keys(utxos).length === 0) {
            return;
        }

        // If not forcing refresh and we have cached charms, use them
        if (!forceRefresh && charms.length > 0) {
            return;
        }

        try {
            setIsLoading(true);
            setError(null);
            const charmsNetwork = activeNetwork === 'testnet' ? 'testnet4' : 'mainnet';
            const fetchedCharms = await charmsService.getCharmsByUTXOs(utxos, charmsNetwork);
            
            // Enhance fetched charms with reference NFT data
            const enhancedCharms = await charmsExplorerAPI.processCharmsWithReferenceData(fetchedCharms);
            setCharms(enhancedCharms);
            
            // Cache the enhanced results
            await saveCharms(enhancedCharms, activeBlockchain, activeNetwork);
            console.log(`[CHARMS] Loaded and cached ${enhancedCharms.length} charms (enhanced with reference data)`);
        } catch (error) {
            console.error('[CHARMS] Failed to load charms:', error);
            setError('Failed to load charms');
        } finally {
            setIsLoading(false);
        }
    };

    const refreshCharms = async () => {
        // Re-use the loadCharms logic for refreshing
        await loadCharms();
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
        loadCharms,
        refreshCharms,
        isNFT,
        getCharmDisplayName
    };

    return <CharmsContext.Provider value={value}>{children}</CharmsContext.Provider>;
}
