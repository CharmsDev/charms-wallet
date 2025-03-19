'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { utxoService } from '@/services/wallet/utxo';
import { useAddresses } from './addressesStore';

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

    // Load UTXOs on address change
    useEffect(() => {
        if (addresses.length > 0) {
            loadUTXOs();
        }
    }, [addresses]);

    // Update total balance on UTXO change
    useEffect(() => {
        const balance = utxoService.calculateTotalBalance(utxos);
        setTotalBalance(balance);
    }, [utxos]);

    const loadUTXOs = async () => {
        try {
            setIsLoading(true);
            setError(null);
            const storedUTXOs = await utxoService.getStoredUTXOs();
            setUTXOs(storedUTXOs);
        } catch (error) {
            console.error('Error loading UTXOs:', error);
            setError('Failed to load UTXOs');
        } finally {
            setIsLoading(false);
        }
    };

    const refreshUTXOs = async () => {
        try {
            setIsLoading(true);
            setError(null);
            const fetchedUTXOs = await utxoService.fetchAndStoreAllUTXOs();
            setUTXOs(fetchedUTXOs);
        } catch (error) {
            console.error('Error refreshing UTXOs:', error);
            setError('Failed to refresh UTXOs');
        } finally {
            setIsLoading(false);
        }
    };

    const getAddressUTXOs = async (address) => {
        try {
            return await utxoService.getAddressUTXOs(address);
        } catch (error) {
            console.error(`Error getting UTXOs for address ${address}:`, error);
            return [];
        }
    };

    const formatSats = (sats) => {
        return utxoService.formatSats(sats);
    };

    const value = {
        utxos,
        isLoading,
        error,
        totalBalance,
        loadUTXOs,
        refreshUTXOs,
        getAddressUTXOs,
        formatSats
    };

    return <UTXOContext.Provider value={value}>{children}</UTXOContext.Provider>;
}
