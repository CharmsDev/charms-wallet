'use client';

// Centralized configuration for the wallet application
const config = {
    // API endpoints
    api: {
        wallet: process.env.NEXT_PUBLIC_WALLET_API_URL || 'https://api-wallet-test.charms.dev',
        charms: process.env.NEXT_PUBLIC_CHARMS_API_URL || 'https://api-wallet-test.charms.dev',
    },

    // Bitcoin network configuration
    bitcoin: {
        network: process.env.NEXT_PUBLIC_BITCOIN_NETWORK || 'testnet',
        isRegtest: () => config.bitcoin.network === 'regtest',
        isTestnet: () => config.bitcoin.network === 'testnet',

        // External API endpoints based on network
        apis: {
            mempool: {
                testnet: 'https://mempool.space/testnet4/api',
                regtest: null, // No mempool API for regtest, we use our local API
            },
        },

        // Get the appropriate API URL based on current network
        getMempoolApiUrl: () => {
            if (config.bitcoin.isRegtest()) {
                return null;
            }
            return config.bitcoin.apis.mempool[config.bitcoin.network];
        },
    },
};

export default config;
