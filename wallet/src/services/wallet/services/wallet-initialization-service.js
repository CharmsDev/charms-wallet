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
        this.totalSteps = 7;
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
            const pairsPerNetwork = 6; // 6 pairs (12 addrs: 6 receive + 6 change) per network

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

            onStepChange(4, 'Fetching balances...');

            // Use syncWalletExplorer — same flow as refresh button
            try {
                const { syncWalletExplorer } = await import('@/services/wallet/sync/explorer-wallet-sync');

                for (const currentNetwork of networks) {
                    try {
                        const result = await syncWalletExplorer({
                            blockchain,
                            network: currentNetwork,
                            fullScan: true,
                            skipCharms: false,
                        });
                        console.log(`[WALLET] Sync (${currentNetwork}): balance=${result.totalBalance}, utxos=${result.utxosUpdated}, charms=${result.charmsFound}`);
                    } catch (error) {
                        console.warn(`[WALLET] Scan failed for ${currentNetwork}:`, error.message);
                    }
                }
            } catch (error) {
                console.warn('[WALLET] Balance fetch error:', error.message);
            }

            onStepChange(7, 'Finalizing setup...');

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
