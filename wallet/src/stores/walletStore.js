'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { generateSeedPhrase, importSeedPhrase } from '@/utils/wallet';
import { getSeedPhrase, clearSeedPhrase } from '@/services/storage';
import * as bitcoin from 'bitcoinjs-lib';
import { getNetwork } from '@/utils/addressUtils';

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

            // Step 3: Generate addresses for both mainnet and testnet
            setInitializationStep('Generating addresses for all networks...');
            setInitializationProgress({ current: 0, total: 1024 }); // 512 addresses × 2 networks

            // Import dependencies dynamically to avoid circular imports
            const { generateInitialBitcoinAddresses } = await import('@/utils/addressUtils');
            const { saveAddresses } = await import('@/services/storage');

            const networks = ['mainnet', 'testnet'];
            let totalAddressesGenerated = 0;

            for (const currentNetwork of networks) {
                // Get the appropriate Bitcoin network object for address generation
                let targetNetwork;
                if (currentNetwork === 'mainnet') {
                    targetNetwork = bitcoin.networks.bitcoin;
                } else {
                    // Use our custom testnet4 network configuration
                    targetNetwork = getNetwork();
                }
                
                await new Promise((resolve, reject) => {
                    generateInitialBitcoinAddresses(
                        finalSeedPhrase,
                        // Progress callback
                        (current, total) => {
                            const networkAddresses = current * 2; // Each index generates 2 addresses
                            const totalCurrent = totalAddressesGenerated + networkAddresses;
                            setInitializationProgress({ current: totalCurrent, total: 1024 });
                            setInitializationStep(`Generating ${currentNetwork} addresses... ${networkAddresses}/512`);
                        },
                        // Complete callback for this network
                        async (generatedAddresses) => {
                            try {
                                setInitializationStep(`Saving ${currentNetwork} addresses...`);
                                const addressesWithBlockchain = generatedAddresses.map(addr => ({ ...addr, blockchain }));
                                await saveAddresses(addressesWithBlockchain, blockchain, currentNetwork);
                                totalAddressesGenerated += 512; // 256 indexes × 2 addresses each
                                resolve(); // Proceed to the next network
                            } catch (error) {
                                reject(error);
                            }
                        },
                        targetNetwork // Pass the specific network for address generation
                    );
                });
            }

            // Step 4: Quick UTXO scan for first 12 addresses
            setInitializationStep('Scanning addresses...');

            try {
                const { refreshFirstAddresses } = await import('@/services/utxo/address-refresh-helper');

                // Scan first 12 addresses on both networks
                for (const currentNetwork of networks) {
                    try {
                        setInitializationStep('Refreshing UTXOs...');
                        await refreshFirstAddresses(12, blockchain, currentNetwork);
                    } catch (error) {
                    }
                }

                // Continue without delay
            } catch (error) {
                // Continue with initialization even if address scanning fails
            }

            // Step 5: Scan for Charms using existing service
            setInitializationStep('Scanning for Charms...');

            try {
                const { charmsService } = await import('@/services/charms/charms');
                const { getUTXOs } = await import('@/services/storage');

                for (const currentNetwork of networks) {
                    try {
                        const utxos = await getUTXOs(blockchain, currentNetwork);
                        
                        if (Object.keys(utxos).length > 0) {
                            setInitializationStep('Processing Charms...');
                            const charmsNetwork = currentNetwork === 'mainnet' ? 'mainnet' : 'testnet4';
                            const charms = await charmsService.getCharmsByUTXOs(utxos, charmsNetwork);
                            
                        }
                    } catch (error) {
                        // Continue with initialization
                    }
                }

                // Continue without delay
            } catch (error) {
                // Continue with initialization
            }

            // Step 6: Recover transaction history
            setInitializationStep('Recovering transaction history...');

            try {
                const { transactionHistoryService } = await import('@/services/wallet/transaction-history-service');

                for (const currentNetwork of networks) {
                    try {
                        setInitializationStep(`Scanning ${currentNetwork} transaction history...`);
                        
                        // Check if history recovery is needed
                        const isRecoveryNeeded = await transactionHistoryService.isHistoryRecoveryNeeded(blockchain, currentNetwork);
                        
                        if (isRecoveryNeeded) {
                            await transactionHistoryService.recoverTransactionHistory(
                                blockchain, 
                                currentNetwork,
                                (progress) => {
                                    if (progress.stage === 'scanning') {
                                        setInitializationStep(`Scanning ${currentNetwork} addresses: ${progress.current}/${progress.total}`);
                                    } else if (progress.stage === 'completed') {
                                        setInitializationStep(`Found ${progress.transactionCount} transactions on ${currentNetwork}`);
                                    }
                                }
                            );
                        } else {
                            setInitializationStep(`${currentNetwork} transaction history already exists`);
                        }
                    } catch (error) {
                        console.error(`[WALLET] Error recovering ${currentNetwork} transaction history:`, error);
                        // Continue with initialization even if history recovery fails
                    }
                }
            } catch (error) {
                console.error('[WALLET] Error importing transaction history service:', error);
                // Continue with initialization
            }

            // Step 7: Finalize setup
            setInitializationStep('Finalizing wallet setup...');

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
        isInitializing,
        initializationStep,
        initializationProgress,
        initializeWalletComplete
    };

    return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
