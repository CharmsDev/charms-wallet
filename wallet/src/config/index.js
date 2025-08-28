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

        // External API endpoints based on network
        apis: {
            quicknode: {
                mainnet: process.env.NEXT_PUBLIC_QUICKNODE_BITCOIN_MAINNET_URL,
                testnet: process.env.NEXT_PUBLIC_QUICKNODE_BITCOIN_TESTNET_URL,
            },
        },

        // Get QuickNode API URL for specific network (accepts network parameter)
        getQuickNodeApiUrl: (network = null) => {
            const targetNetwork = network || config.bitcoin.network;
            if (targetNetwork === 'mainnet' && config.bitcoin.apis.quicknode.mainnet) {
                return config.bitcoin.apis.quicknode.mainnet;
            }
            if (targetNetwork === 'testnet' && config.bitcoin.apis.quicknode.testnet) {
                return config.bitcoin.apis.quicknode.testnet;
            }
            return null;
        },

        // Check if QuickNode is available for specific network
        hasQuickNode: (network = null) => {
            return config.bitcoin.getQuickNodeApiUrl(network) !== null;
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
            return config.cardano.apis.blockfrost[config.cardano.network];
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
