'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { generateSeedPhrase, importSeedPhrase } from '@/utils/wallet';
import { getSeedPhrase, clearSeedPhrase } from '@/services/storage';
import { WalletInitializationService } from '@/services/wallet/services/wallet-initialization-service';

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
    const [isCheckingWallet, setIsCheckingWallet] = useState(true);
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
            setIsCheckingWallet(false); // Finished checking
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
    const initializeWallet = async (seedPhraseInput = null, isImport = false) => {
        try {
            setIsInitializing(true);
            setError(null);

            const walletService = new WalletInitializationService();
            const finalSeedPhrase = await walletService.initializeWallet(
                seedPhraseInput,
                isImport,
                'bitcoin',
                'testnet4',
                (step, progressOrMessage) => {
                    // The service currently calls onStepChange(stepNumber, messageString)
                    // Normalize to: initializationStep = message (string), initializationProgress = { current, total }
                    if (typeof progressOrMessage === 'string') {
                        // Set human-readable step message
                        setInitializationStep(progressOrMessage);
                        // Derive coarse progress from step index (7 visible steps)
                        const totalSteps = 7;
                        const current = Math.min(Number(step) || 0, totalSteps);
                        setInitializationProgress({ current, total: totalSteps });
                    } else if (progressOrMessage && typeof progressOrMessage === 'object') {
                        // Pass through object progress if the service ever sends it
                        setInitializationProgress({ ...progressOrMessage });
                        // If step is a string message in this mode, reflect it; otherwise leave as-is
                        setInitializationStep(typeof step === 'string' ? step : '');
                    } else {
                        // Fallback safe state
                        setInitializationProgress({ current: 0, total: 0 });
                        setInitializationStep('');
                    }
                },
                (errorMessage) => {
                    setError(errorMessage);
                }
            );

            setSeedPhrase(finalSeedPhrase);
            setHasWallet(true);
            setIsInitializing(false);
            setInitializationStep('');
            setInitializationProgress({ current: 0, total: 0 });

            return finalSeedPhrase;

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
        isCheckingWallet,
        createWallet,
        importWallet,
        clearWallet,
        initializeWallet,
        initializeWalletComplete: initializeWallet, // Alias for backward compatibility
        isInitializing,
        initializationStep,
        initializationProgress
    };

    return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
