/**
 * Prover Service Configuration
 * Centralizes all configuration constants and URLs for Charms Wallet
 */

import config from '@/config';

export const PROVER_CONFIG = {
    // Get API URL from config based on network
    getApiUrl: (network) => {
        return config.api.getProverUrl(network);
    },

    // Decimal places for charm amounts
    DECIMAL_PLACES: 8,

    // LocalStorage keys (if needed)
    STORAGE_KEYS: {
        TRANSFER_DATA: 'charm_transfer_data',
        WALLET_DATA: 'charm_wallet_data'
    }
};
