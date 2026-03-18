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

            // Use Explorer API for fast balance + charm + UTXO fetch (single round-trip per network)
            try {
                const { getAddresses } = await import('@/services/storage');
                const { explorerWalletService } = await import('@/services/shared/explorer-wallet-service');
                const { syncUTXOs } = await import('@/services/wallet/sync/utxo-sync');

                for (const currentNetwork of networks) {
                    try {
                        const storedAddresses = await getAddresses(blockchain, currentNetwork);
                        const addressList = storedAddresses.map(a => a.address);
                        if (addressList.length === 0) continue;

                        const explorerAvailable = explorerWalletService.isAvailable(currentNetwork);
                        if (explorerAvailable) {
                            // Fast path: Explorer API aggregate endpoints
                            const [utxos, charmBalances] = await Promise.all([
                                explorerWalletService.getAggregateUTXOs(addressList, currentNetwork),
                                explorerWalletService.getAggregateCharmBalances(addressList, currentNetwork),
                            ]);

                            // Build set of charm-bearing UTXOs to exclude from BTC balance
                            const charmUtxoKeys = new Set();
                            if (Array.isArray(charmBalances)) {
                                for (const balance of charmBalances) {
                                    for (const u of (balance.utxos || [])) {
                                        charmUtxoKeys.add(`${u.txid}:${u.vout}`);
                                    }
                                }
                            }

                            // Calculate BTC balance from UTXOs (excluding charm UTXOs and dust ≤ 1000 sats)
                            let confirmed = 0, unconfirmed = 0;
                            for (const u of utxos) {
                                if (charmUtxoKeys.has(`${u.txid}:${u.vout}`)) continue;
                                if ((u.value || 0) <= 1000) continue; // Exclude dust/charm outputs
                                if ((u.confirmations || 0) >= 1) confirmed += u.value || 0;
                                else unconfirmed += u.value || 0;
                            }

                            // Update balance store
                            const { useUTXOStore } = await import('@/stores/utxoStore');
                            if (currentNetwork === network) {
                                useUTXOStore.setState({ totalBalance: confirmed, pendingBalance: unconfirmed });
                            }

                            // Process charms
                            if (Array.isArray(charmBalances) && charmBalances.length > 0) {
                                const { saveCharms } = await import('@/services/storage');
                                const charms = [];
                                for (const balance of charmBalances) {
                                    for (const u of (balance.utxos || [])) {
                                        if (u.mempoolSpent) continue;
                                        charms.push({
                                            txid: u.txid, outputIndex: u.vout, address: u.address,
                                            appId: u.appId || u.app_id, amount: u.amount || 0,
                                            type: 'token', confirmed: u.confirmed ?? false,
                                        });
                                    }
                                }
                                await saveCharms(charms, blockchain, currentNetwork);
                            }

                            console.log(`[WALLET] Explorer API (${currentNetwork}): ${confirmed + unconfirmed} sats, ${charmBalances?.length || 0} token types`);
                        }

                        // UTXO sync for spending capability (runs after display is ready)
                        onStepChange(5, 'Syncing UTXOs...');
                        await syncUTXOs({ blockchain, network: currentNetwork, fullScan: true });
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
