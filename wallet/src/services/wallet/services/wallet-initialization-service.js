'use client';

import { generateSeedPhrase, importSeedPhrase } from '@/utils/wallet';
import * as bitcoin from 'bitcoinjs-lib';
import { getNetwork } from '@/utils/addressUtils';

/**
 * Wallet Initialization Service
 * Orchestrates complete wallet setup process
 */
export class WalletInitializationService {
    constructor() {
        this.totalSteps = 8;
    }

    /**
     * Initialize wallet with complete setup process
     */
    async initializeWallet(
        seedPhraseInput = null, 
        isImport = false, 
        blockchain = 'bitcoin', 
        network = 'testnet4',
        onStepChange = null,
        onError = null
    ) {
        try {
            const setStep = (step, progress) => {
                if (onStepChange) {
                    onStepChange(step, { current: progress, total: this.totalSteps });
                }
            };

            onStepChange(1, isImport ? 'Validating seed phrase...' : 'Creating seed phrase...');
            let finalSeedPhrase;

            if (isImport) {
                finalSeedPhrase = await importSeedPhrase(seedPhraseInput);
            } else {
                finalSeedPhrase = await generateSeedPhrase();
            }

            onStepChange(2, 'Deriving wallet info...');

            onStepChange(3, 'Generating addresses...');

            // Import dependencies dynamically to avoid circular imports
            const { generateInitialBitcoinAddressesFast } = await import('@/utils/addressUtils');
            const { saveAddresses } = await import('@/services/storage');

            const networks = ['mainnet', 'testnet4'];
            const pairsPerNetwork = 256; // 256 pairs (512 addrs) per network as requested

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
                    generateInitialBitcoinAddressesFast(
                        finalSeedPhrase,
                        // Progress callback (keep generic)
                        () => {}, // No sub-progress to avoid step interference
                        // Complete callback for this network
                        async (generatedAddresses) => {
                            try {
                                const addressesWithBlockchain = generatedAddresses.map(addr => ({ ...addr, blockchain }));
                                await saveAddresses(addressesWithBlockchain, blockchain, currentNetwork);
                                resolve(); // Proceed to the next network
                            } catch (error) {
                                reject(error);
                            }
                        },
                        targetNetwork, // Pass the specific network for address generation
                        pairsPerNetwork // limit pairs per network
                    );
                });
            }

            onStepChange(4, 'Scanning addresses...');

            try {
                // Use centralized batch scanner with a limit of 12 addresses per network
                const { utxoService } = await import('@/services/utxo');

                for (const currentNetwork of networks) {
                    try {
                        await utxoService.fetchAndStoreAllUTXOsSequential(
                            blockchain,
                            currentNetwork,
                            null, // no onProgress during initialization to keep steps clean
                            24    // limit to 24 addresses (12 indices = 12 receive + 12 change)
                        );
                    } catch (error) {
                        // Continue with initialization
                    }
                }
            } catch (error) {
                // Continue with initialization even if address scanning fails
            }

            onStepChange(5, 'Scanning for Charms...');

            try {
                const { charmsService } = await import('@/services/charms/charms');
                const { getUTXOs } = await import('@/services/storage');

                for (const currentNetwork of networks) {
                    try {
                        const utxos = await getUTXOs(blockchain, currentNetwork);
                        
                        if (Object.keys(utxos).length > 0) {
                            const charmsNetwork = currentNetwork === 'mainnet' ? 'mainnet' : 'testnet4';
                            const charms = await charmsService.getCharmsByUTXOs(utxos, charmsNetwork);
                        }
                    } catch (error) {
                        // Continue with initialization
                    }
                }
            } catch (error) {
                // Continue with initialization
            }

            onStepChange(6, 'Scanning for transaction history...');

            try {
                const transactionHistoryModule = await import('@/services/wallet/services/transaction-history-service');
                const transactionHistoryService = transactionHistoryModule.default || transactionHistoryModule.transactionHistoryService;

                for (const currentNetwork of networks) {
                    try {
                        // Check if history recovery is needed
                        const isRecoveryNeeded = await transactionHistoryService.isHistoryRecoveryNeeded(blockchain, currentNetwork);
                        
                        if (isRecoveryNeeded) {
                            await transactionHistoryService.recoverTransactionHistory(
                                blockchain, 
                                currentNetwork,
                                null, // No progress callback to avoid step interference
                                12 // FORCE 12 addresses limit
                            );
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

            onStepChange(7, 'Calculating balances...');

            // CRITICAL: Calculate and save balances for both networks
            try {
                const { utxoService } = await import('@/services/utxo');
                const { getUTXOs, getCharms, saveBalance } = await import('@/services/storage');

                for (const currentNetwork of networks) {
                    try {
                        const utxos = await getUTXOs(blockchain, currentNetwork);
                        const charms = await getCharms(blockchain, currentNetwork) || [];
                        
                        // CRITICAL: calculateBalances filters out charms, ordinals, runes - ensures correct balance
                        const balanceData = utxoService.calculateBalances(utxos, charms);
                        
                        // Calculate token balances
                        let tokenBalances = [];
                        if (charms.length > 0) {
                            const { useCharmsStore } = await import('@/stores/charms');
                            const tokenGroups = useCharmsStore.getState().groupTokensByAppId();
                            tokenBalances = tokenGroups.map(group => ({
                                appId: group.appId,
                                name: group.name,
                                ticker: group.ticker,
                                amount: group.totalAmount
                            }));
                        }
                        
                        // Calculate total balance (spendable + pending, excludes reserved UTXOs)
                        const totalBalance = balanceData.spendable + balanceData.pending;
                        
                        // Save balance to localStorage
                        await saveBalance({
                            spendable: balanceData.spendable,
                            pending: balanceData.pending,
                            total: totalBalance,
                            nonSpendable: balanceData.nonSpendable,
                            utxoCount: Object.values(utxos).reduce((sum, list) => sum + list.length, 0),
                            charmCount: charms.length,
                            ordinalCount: 0,
                            runeCount: 0,
                            tokens: tokenBalances
                        }, blockchain, currentNetwork);
                        
                        // Update UTXO store in memory for active network
                        if (currentNetwork === network) {
                            const { useUTXOStore } = await import('@/stores/utxoStore');
                            useUTXOStore.setState({
                                totalBalance: balanceData.spendable,
                                pendingBalance: balanceData.pending
                            });
                        }
                    } catch (error) {
                        console.error(`[WALLET] Error calculating balance for ${currentNetwork}:`, error);
                        // Continue with initialization
                    }
                }
            } catch (error) {
                console.error('[WALLET] Error calculating balances:', error);
                // Continue with initialization
            }

            onStepChange(8, 'Finalizing setup...');

            return finalSeedPhrase;

        } catch (err) {
            if (onError) {
                onError('Failed to initialize wallet: ' + err.message);
            }
            throw err;
        }
    }

    /**
     * Create a new wallet with full initialization
     */
    async createWallet(blockchain = 'bitcoin', network = 'testnet4', onStepChange = null, onError = null) {
        return await this.initializeWallet(null, false, blockchain, network, onStepChange, onError);
    }

    /**
     * Import an existing wallet with full initialization
     */
    async importWallet(seedPhrase, blockchain = 'bitcoin', network = 'testnet4', onStepChange = null, onError = null) {
        return await this.initializeWallet(seedPhrase, true, blockchain, network, onStepChange, onError);
    }
}

// Create and export singleton instance
export const walletInitializationService = new WalletInitializationService();
export default walletInitializationService;
