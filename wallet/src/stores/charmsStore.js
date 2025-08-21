'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { charmsService } from '@/services/charms/charms';
import { useUTXOs } from './utxoStore';
import { useBlockchain } from './blockchainStore';

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
    const { activeNetwork } = useBlockchain();

    // Load charms on request, not UTXO change

    const loadCharms = async () => {
        try {
            setIsLoading(true);
            setError(null);
            const charmsNetwork = activeNetwork === 'testnet' ? 'testnet4' : 'mainnet';
            const fetchedCharms = await charmsService.getCharmsByUTXOs(utxos, charmsNetwork);
            setCharms(fetchedCharms);
        } catch (error) {
            setError('Failed to load charms');
        } finally {
            setIsLoading(false);
        }
    };

    const refreshCharms = async () => {
        try {
            setIsLoading(true);
            setError(null);
            const charmsNetwork = activeNetwork === 'testnet' ? 'testnet4' : 'mainnet';
            const fetchedCharms = await charmsService.getCharmsByUTXOs(utxos, charmsNetwork);
            setCharms(fetchedCharms);
        } catch (error) {
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
