'use client';

import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';

// Centralized configuration for the wallet application
const config = {
    // API endpoints
    api: {
        wallet: process.env.NEXT_PUBLIC_WALLET_API_URL || 'https://api-wallet-test.charms.dev',
        charms: process.env.NEXT_PUBLIC_CHARMS_API_URL || 'https://api-t4.charms.dev',
        cardano: process.env.NEXT_PUBLIC_CARDANO_API_URL || 'https://cardano-preprod.blockfrost.io/api/v0',
        prover: process.env.NEXT_PUBLIC_PROVE_API_URL || 'https://prover-api.charms.dev',
    },

    // Bitcoin network configuration
    bitcoin: {
        network: process.env.NEXT_PUBLIC_BITCOIN_NETWORK || 'testnet',
        isRegtest: () => config.bitcoin.network === 'regtest',
        isTestnet: () => config.bitcoin.network === 'testnet',
        isMainnet: () => config.bitcoin.network === 'mainnet',

        // External API endpoints based on network
        apis: {
            mempool: {
                mainnet: 'https://mempool.space/api',
                testnet: 'https://mempool.space/testnet4/api',
                regtest: null, // No mempool API for regtest, we use our local API
            },
            quicknode: {
                testnet: process.env.NEXT_PUBLIC_QUICKNODE_BITCOIN_TESTNET_URL || null,
                apiKey: process.env.NEXT_PUBLIC_QUICKNODE_API_KEY || null,
            },
        },

        // Get the appropriate API URL based on current network
        getMempoolApiUrl: () => {
            if (config.bitcoin.isRegtest()) {
                return null;
            }
            return config.bitcoin.apis.mempool[config.bitcoin.network];
        },

        // Get QuickNode API URL for current network
        getQuickNodeApiUrl: () => {
            if (config.bitcoin.isTestnet() && config.bitcoin.apis.quicknode.testnet) {
                return config.bitcoin.apis.quicknode.testnet;
            }
            return null;
        },

        // Get QuickNode API key
        getQuickNodeApiKey: () => {
            return config.bitcoin.apis.quicknode.apiKey;
        },

        // Check if QuickNode is available for current network
        hasQuickNode: () => {
            // Re-enabled QuickNode with correct bb_getUTXOs Blockbook RPC parameters
            return config.bitcoin.getQuickNodeApiUrl() !== null && config.bitcoin.getQuickNodeApiKey() !== null;
        },
    },

    // Cardano network configuration
    cardano: {
        network: process.env.NEXT_PUBLIC_CARDANO_NETWORK || NETWORKS.CARDANO.TESTNET,
        isMainnet: () => config.cardano.network === NETWORKS.CARDANO.MAINNET,
        isTestnet: () => config.cardano.network === NETWORKS.CARDANO.TESTNET,

        // External API endpoints based on network
        apis: {
            blockfrost: {
                mainnet: 'https://cardano-mainnet.blockfrost.io/api/v0',
                preprod: 'https://cardano-preprod.blockfrost.io/api/v0',
            },
        },

        // Get the appropriate API URL based on current network
        getBlockfrostApiUrl: () => {
            return config.cardano.apis.blockfrost[config.cardano.network];
        },

        // Blockfrost project ID
        blockfrostProjectId: process.env.NEXT_PUBLIC_BLOCKFROST_PROJECT_ID || 'testnetProjectId',
    },

    // Get active blockchain configuration
    getBlockchainConfig: (blockchain) => {
        if (blockchain === BLOCKCHAINS.BITCOIN) {
            return config.bitcoin;
        } else if (blockchain === BLOCKCHAINS.CARDANO) {
            return config.cardano;
        }
        return config.bitcoin; // Default to Bitcoin
    },
};

export default config;
