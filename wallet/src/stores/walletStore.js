'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { generateSeedPhrase } from '@/utils/wallet';
import { getSeedPhrase, clearSeedPhrase } from '@/services/storage';

// Create context
const WalletContext = createContext();

// Use wallet context
export const useWallet = () => {
    const context = useContext(WalletContext);
    if (!context) {
        throw new Error('useWallet must be used within a WalletProvider');
    }
    return context;
};

// Provider component
export function WalletProvider({ children }) {
    const [seedPhrase, setSeedPhrase] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [hasWallet, setHasWallet] = useState(false);

    // Check/load wallet on mount
    useEffect(() => {
        const checkWalletExists = async () => {
            const storedSeedPhrase = await getSeedPhrase();
            if (storedSeedPhrase) {
                setSeedPhrase(storedSeedPhrase);
                setHasWallet(true);
            } else {
                setHasWallet(false);
            }
        };

        checkWalletExists();
        // Add event listener for storage changes
        window.addEventListener('storage', checkWalletExists);
        return () => window.removeEventListener('storage', checkWalletExists);
    }, []);

    // Create a new wallet
    const createWallet = async () => {
        try {
            setIsLoading(true);
            setError(null);
            const newSeedPhrase = await generateSeedPhrase();
            setSeedPhrase(newSeedPhrase);
            setHasWallet(true);
            return newSeedPhrase;
        } catch (err) {
            setError('Failed to create wallet: ' + err.message);
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    // Clear wallet from state and storage
    const clearWallet = async () => {
        await clearSeedPhrase();
        setSeedPhrase(null);
        setHasWallet(false);
    };

    // Context value
    const value = {
        seedPhrase,
        hasWallet,
        isLoading,
        error,
        createWallet,
        clearWallet
    };

    return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
