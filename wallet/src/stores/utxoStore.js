'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { utxoService } from '@/services/utxo';
import { useAddresses } from './addressesStore';
import { useBlockchain } from './blockchainStore';

const UTXOContext = createContext();

export const useUTXOs = () => {
    const context = useContext(UTXOContext);
    if (!context) {
        throw new Error('useUTXOs must be used within a UTXOProvider');
    }
    return context;
};

export function UTXOProvider({ children }) {
    const [utxos, setUTXOs] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [totalBalance, setTotalBalance] = useState(0);
    const { addresses } = useAddresses();
    const { activeBlockchain, activeNetwork, isBitcoin, isCardano } = useBlockchain();

    // Trigger UTXO loading when addresses change or blockchain/network changes
    useEffect(() => {
        if (addresses.length > 0) {
            loadUTXOs();
        }
    }, [addresses, activeBlockchain, activeNetwork]);

    // Recalculate balance when UTXOs change
    useEffect(() => {
        const balance = utxoService.calculateTotalBalance(utxos);
        setTotalBalance(balance);
    }, [utxos]);

    const loadUTXOs = async () => {
        try {
            setIsLoading(true);
            setError(null);
            const storedUTXOs = await utxoService.getStoredUTXOs(activeBlockchain, activeNetwork);
            setUTXOs(storedUTXOs);
        } catch (error) {
            console.error('Failed to load UTXOs:', error);
            setError('Failed to load UTXOs');
            setUTXOs({});
        } finally {
            setIsLoading(false);
        }
    };

    const refreshUTXOs = async () => {
        try {
            setIsLoading(true);
            setError(null);
            const fetchedUTXOs = await utxoService.fetchAndStoreAllUTXOs(activeBlockchain, activeNetwork);
            setUTXOs(fetchedUTXOs);
        } catch (error) {
            console.error('Failed to refresh UTXOs:', error);
            setError('Failed to refresh UTXOs');
        } finally {
            setIsLoading(false);
        }
    };

    const getAddressUTXOs = async (address) => {
        try {
            return await utxoService.getAddressUTXOs(address, activeBlockchain, activeNetwork);
        } catch (error) {
            console.error('Failed to get address UTXOs:', error);
            return [];
        }
    };

    // Format value based on blockchain
    const formatValue = (value) => {
        if (isBitcoin()) {
            return utxoService.formatSats(value);
        } else if (isCardano()) {
            // Format ADA (1 ADA = 1,000,000 lovelace)
            return (value / 1000000).toFixed(6) + ' ADA';
        }
        return value.toString();
    };

    const value = {
        utxos,
        isLoading,
        error,
        totalBalance,
        loadUTXOs,
        refreshUTXOs,
        getAddressUTXOs,
        formatValue,
        activeBlockchain,
        activeNetwork
    };

    return <UTXOContext.Provider value={value}>{children}</UTXOContext.Provider>;
}
