'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { generateSeedPhrase, importSeedPhrase } from '@/utils/wallet';
import { getSeedPhrase, clearSeedPhrase, saveSeedPhrase } from '@/services/storage';
import { WalletInitializationService } from '@/services/wallet/services/wallet-initialization-service';
import { StorageAdapter } from '@/services/storage-adapter';
import { SYSTEM_KEYS } from '@/services/storage-keys';

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

    // Check/load wallet on mount. Three states once we settle:
    //   - plaintext seed found     → seedPhrase set + hasWallet=true (today's path)
    //   - passkey auth blob found  → hasWallet=true, seedPhrase stays null
    //                                until AuthContext.triggerUnlock() hydrates it
    //   - nothing found            → hasWallet=false (onboarding)
    useEffect(() => {
        const checkWalletExists = async () => {
            const authBlob = await StorageAdapter.get(SYSTEM_KEYS.AUTH);
            if (authBlob) {
                // Locked wallet — AuthContext owns the unlock flow.
                setHasWallet(true);
                setIsCheckingWallet(false);
                return;
            }
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

    // Create a new wallet — legacy plaintext path. The setup wizard
    // is the preferred entry point; this helper exists for callers
    // that bypass the wizard. Persists plaintext, no passkey.
    const createWallet = async () => {
        try {
            setIsLoading(true);
            setError(null);
            const newSeedPhrase = await generateSeedPhrase();
            await saveSeedPhrase(newSeedPhrase);
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

    // Import an existing wallet — legacy plaintext path.
    const importWallet = async (inputSeedPhrase) => {
        try {
            setIsLoading(true);
            setError(null);
            const validatedSeedPhrase = await importSeedPhrase(inputSeedPhrase);
            await saveSeedPhrase(validatedSeedPhrase);
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

    // Initialize wallet completely (generate/validate seed + derive
    // addresses + sync). Two persistence modes:
    //   alreadyPersisted=false (default)
    //     legacy plaintext path — saves the seed via saveSeedPhrase()
    //     before returning. Used by the URL `?seed=` import flow and
    //     any caller bypassing the wizard.
    //   alreadyPersisted=true
    //     the caller has already written the seed (e.g. the setup
    //     wizard wrote an encrypted AUTH blob via commitEnrollment).
    //     We skip the plaintext save and just hydrate state.
    const initializeWallet = async (seedPhraseInput = null, isImport = false, opts = {}) => {
        const { alreadyPersisted = false } = opts;
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

            if (!alreadyPersisted) {
                await saveSeedPhrase(finalSeedPhrase);
            }
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
        // Exposed so AuthContext can hydrate the store after a passkey
        // unlock without going through create/import. Receives `null`
        // when the user explicitly locks the wallet.
        setSeedPhrase,
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
