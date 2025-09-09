'use client';

import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';

// Centralized configuration for the wallet application
const config = {
    // API endpoints
    api: {
        wallet: process.env.NEXT_PUBLIC_WALLET_API_URL,
        charms: process.env.NEXT_PUBLIC_CHARMS_API_URL,
        cardano: process.env.NEXT_PUBLIC_CARDANO_API_URL,
        prover: process.env.NEXT_PUBLIC_PROVE_API_URL,
    },

    // Bitcoin network configuration
    bitcoin: {
        network: process.env.NEXT_PUBLIC_BITCOIN_NETWORK,
        isRegtest: () => config.bitcoin.network === 'regtest',
        isTestnet: () => config.bitcoin.network === 'testnet',
        isMainnet: () => config.bitcoin.network === 'mainnet',
        // Direct QuickNode endpoints and API keys (browser will call provider directly)
        apis: {
            quicknode: {
                mainnet: process.env.NEXT_PUBLIC_QUICKNODE_BITCOIN_MAINNET_URL,
                testnet: process.env.NEXT_PUBLIC_QUICKNODE_BITCOIN_TESTNET_URL,
            },
        },
        apiKeys: {
            quicknode: {
                mainnet: process.env.NEXT_PUBLIC_QUICKNODE_BITCOIN_MAINNET_API_KEY,
                // Kept for backward compatibility naming for testnet
                testnet: process.env.NEXT_PUBLIC_QUICKNODE_API_KEY,
            },
        },

        // Resolve URL by network ('mainnet' | 'testnet')
        getQuickNodeApiUrl: (network = null) => {
            const target = (network || config.bitcoin.network || '').toString().toLowerCase();
            if (target === 'mainnet') return config.bitcoin.apis.quicknode.mainnet || null;
            if (target === 'testnet' || target === 'testnet4') return config.bitcoin.apis.quicknode.testnet || null;
            return null;
        },

        // Resolve API key by network
        getQuickNodeApiKey: (network = null) => {
            const target = (network || config.bitcoin.network || '').toString().toLowerCase();
            if (target === 'mainnet') return config.bitcoin.apiKeys.quicknode.mainnet || null;
            if (target === 'testnet' || target === 'testnet4') return config.bitcoin.apiKeys.quicknode.testnet || null;
            return null;
        },

        // Check if QuickNode direct access is available
        hasQuickNode: (network = null) => {
            const url = config.bitcoin.getQuickNodeApiUrl(network);
            const key = config.bitcoin.getQuickNodeApiKey(network);
            return !!(url && url.trim() !== '' && key && key.trim() !== '');
        },
    },

    // Cardano network configuration
    cardano: {
        network: process.env.NEXT_PUBLIC_CARDANO_NETWORK,
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
            return config.cardano.apis.blockfrost[config.cardano.network || 'mainnet'];
        },

        // Blockfrost project ID
        blockfrostProjectId: process.env.NEXT_PUBLIC_BLOCKFROST_PROJECT_ID,
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
