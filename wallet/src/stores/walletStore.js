'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { generateSeedPhrase, importSeedPhrase } from '@/utils/wallet';
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
    const [isInitializing, setIsInitializing] = useState(false);
    const [initializationStep, setInitializationStep] = useState('');
    const [initializationProgress, setInitializationProgress] = useState({ current: 0, total: 0 });

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

    // Import an existing wallet
    const importWallet = async (inputSeedPhrase) => {
        try {
            setIsLoading(true);
            setError(null);
            const validatedSeedPhrase = await importSeedPhrase(inputSeedPhrase);
            setSeedPhrase(validatedSeedPhrase);
            setHasWallet(true);
            return validatedSeedPhrase;
        } catch (err) {
            setError('Failed to import wallet: ' + err.message);
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    // Initialize wallet completely (create/import + generate all addresses)
    const initializeWalletComplete = async (seedPhraseInput = null, isImport = false, blockchain = 'bitcoin', network = 'testnet') => {
        try {
            setIsInitializing(true);
            setError(null);

            // Step 1: Create or validate seed phrase
            setInitializationStep(isImport ? 'Validating seed phrase...' : 'Creating wallet...');
            let finalSeedPhrase;

            if (isImport) {
                finalSeedPhrase = await importSeedPhrase(seedPhraseInput);
            } else {
                finalSeedPhrase = await generateSeedPhrase();
            }

            setSeedPhrase(finalSeedPhrase);

            // Step 2: Derive wallet information
            setInitializationStep('Deriving wallet information...');
            await new Promise(resolve => setTimeout(resolve, 500)); // Small delay for UX

            // Step 3: Generate all addresses
            setInitializationStep('Generating addresses...');
            setInitializationProgress({ current: 0, total: 512 });

            // Import the address generation function dynamically to avoid circular imports
            const { generateInitialBitcoinAddresses } = await import('@/utils/addressUtils');
            const { saveAddresses } = await import('@/services/storage');

            return new Promise((resolve, reject) => {
                generateInitialBitcoinAddresses(
                    finalSeedPhrase,
                    // Progress callback
                    (current, total) => {
                        const addressCount = current * 2; // Each index generates 2 addresses
                        setInitializationProgress({ current: addressCount, total: total * 2 });
                        setInitializationStep(`Generating addresses... ${addressCount}/${total * 2}`);
                    },
                    // Complete callback
                    async (generatedAddresses) => {
                        try {
                            setInitializationStep('Saving addresses...');

                            // Add blockchain info to addresses
                            const addressesWithBlockchain = generatedAddresses.map(addr => ({
                                ...addr,
                                blockchain: blockchain
                            }));

                            // Save to storage with the correct blockchain and network
                            await saveAddresses(addressesWithBlockchain, blockchain, network);

                            // Step 4: Finalize
                            setInitializationStep('Finalizing wallet setup...');
                            await new Promise(resolve => setTimeout(resolve, 500));

                            setHasWallet(true);
                            setIsInitializing(false);
                            setInitializationStep('');
                            setInitializationProgress({ current: 0, total: 0 });

                            resolve(finalSeedPhrase);
                        } catch (error) {
                            reject(error);
                        }
                    }
                );
            });

        } catch (err) {
            setError('Failed to initialize wallet: ' + err.message);
            setIsInitializing(false);
            setInitializationStep('');
            setInitializationProgress({ current: 0, total: 0 });
            throw err;
        }
    };

    // Context value
    const value = {
        seedPhrase,
        hasWallet,
        isLoading,
        error,
        createWallet,
        importWallet,
        clearWallet,
        isInitializing,
        initializationStep,
        initializationProgress,
        initializeWalletComplete
    };

    return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
