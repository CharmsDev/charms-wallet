'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { charmsService } from '@/services/wallet/charms';
import { useUTXOs } from './utxoStore';

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
    const { utxos } = useUTXOs();

    // We'll only load charms when explicitly requested, not automatically when UTXOs change
    // This prevents unnecessary API calls when viewing other sections

    const loadCharms = async () => {
        try {
            setIsLoading(true);
            setError(null);
            const fetchedCharms = await charmsService.getCharmsByUTXOs(utxos);
            setCharms(fetchedCharms);
        } catch (error) {
            console.error('Error loading charms:', error);
            setError('Failed to load charms');
        } finally {
            setIsLoading(false);
        }
    };

    const refreshCharms = async () => {
        try {
            setIsLoading(true);
            setError(null);
            const fetchedCharms = await charmsService.getCharmsByUTXOs(utxos);
            setCharms(fetchedCharms);
        } catch (error) {
            console.error('Error refreshing charms:', error);
            setError('Failed to refresh charms');
        } finally {
            setIsLoading(false);
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
        loadCharms,
        refreshCharms,
        isNFT,
        getCharmDisplayName
    };

    return <CharmsContext.Provider value={value}>{children}</CharmsContext.Provider>;
}
