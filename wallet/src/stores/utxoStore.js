'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { utxoService } from '@/services/utxo';
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

    // Trigger UTXO loading when addresses change
    useEffect(() => {
        if (addresses.length > 0) {
            loadUTXOs();
        }
    }, [addresses]);

    // Recalculate balance when UTXOs change
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
            setError('Failed to refresh UTXOs');
        } finally {
            setIsLoading(false);
        }
    };

    const getAddressUTXOs = async (address) => {
        try {
            return await utxoService.getAddressUTXOs(address);
        } catch (error) {
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
