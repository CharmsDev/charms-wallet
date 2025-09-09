'use client';

import { createContext, useContext, useState, useEffect } from 'react';

// Define supported blockchains and networks
export const BLOCKCHAINS = {
    BITCOIN: 'bitcoin',
    CARDANO: 'cardano'
};

export const NETWORKS = {
    BITCOIN: {
        MAINNET: 'mainnet',
        TESTNET: 'testnet4'
    },
    CARDANO: {
        MAINNET: 'mainnet',
        TESTNET: 'preprod'
    }
};

// Local storage keys
const STORAGE_KEYS = {
    ACTIVE_BLOCKCHAIN: 'active_blockchain',
    ACTIVE_NETWORK: 'active_network'
};

// Create network context
const NetworkContext = createContext();

// Hook to use network context
export const useNetwork = () => {
    const context = useContext(NetworkContext);
    if (!context) {
        throw new Error('useNetwork must be used within a NetworkProvider');
    }
    return context;
};

// Network provider component - single source of truth for network state
export function NetworkProvider({ children }) {
    const [activeBlockchain, setActiveBlockchain] = useState(BLOCKCHAINS.BITCOIN);
    const [activeNetwork, setActiveNetwork] = useState(NETWORKS.BITCOIN.MAINNET);
    const [isLoading, setIsLoading] = useState(true);

    // Load saved preferences on mount
    useEffect(() => {
        const loadSavedPreferences = () => {
            const savedBlockchain = localStorage.getItem(STORAGE_KEYS.ACTIVE_BLOCKCHAIN);
            const savedNetwork = localStorage.getItem(STORAGE_KEYS.ACTIVE_NETWORK);

            if (savedBlockchain) {
                setActiveBlockchain(savedBlockchain);
            }

            if (savedNetwork) {
                setActiveNetwork(savedNetwork);
            } else {
                // Set default network based on blockchain
                if (savedBlockchain === BLOCKCHAINS.CARDANO) {
                    setActiveNetwork(NETWORKS.CARDANO.MAINNET);
                } else {
                    setActiveNetwork(NETWORKS.BITCOIN.MAINNET);
                }
            }

            setIsLoading(false);
        };

        loadSavedPreferences();
    }, []);

    // Save blockchain selection to localStorage
    const saveBlockchain = (blockchain) => {
        localStorage.setItem(STORAGE_KEYS.ACTIVE_BLOCKCHAIN, blockchain);
        setActiveBlockchain(blockchain);

        // Update network to match the blockchain's default mainnet
        if (blockchain === BLOCKCHAINS.BITCOIN) {
            setActiveNetwork(NETWORKS.BITCOIN.MAINNET);
            localStorage.setItem(STORAGE_KEYS.ACTIVE_NETWORK, NETWORKS.BITCOIN.MAINNET);
        } else if (blockchain === BLOCKCHAINS.CARDANO) {
            setActiveNetwork(NETWORKS.CARDANO.MAINNET);
            localStorage.setItem(STORAGE_KEYS.ACTIVE_NETWORK, NETWORKS.CARDANO.MAINNET);
        }
    };

    // Save network selection to localStorage
    const saveNetwork = (network) => {
        localStorage.setItem(STORAGE_KEYS.ACTIVE_NETWORK, network);
        setActiveNetwork(network);
    };

    // Get available networks for the current blockchain
    const getAvailableNetworks = () => {
        if (activeBlockchain === BLOCKCHAINS.BITCOIN) {
            return [
                { id: NETWORKS.BITCOIN.MAINNET, name: 'Mainnet' },
                { id: NETWORKS.BITCOIN.TESTNET, name: 'Testnet4' }
            ];
        } else if (activeBlockchain === BLOCKCHAINS.CARDANO) {
            return [
                { id: NETWORKS.CARDANO.MAINNET, name: 'Mainnet' },
                { id: NETWORKS.CARDANO.TESTNET, name: 'Preprod' }
            ];
        }
        return [];
    };

    // Utility functions
    const isBitcoin = () => activeBlockchain === BLOCKCHAINS.BITCOIN;
    const isCardano = () => activeBlockchain === BLOCKCHAINS.CARDANO;
    const isMainnet = () => {
        if (isBitcoin()) {
            return activeNetwork === NETWORKS.BITCOIN.MAINNET;
        } else if (isCardano()) {
            return activeNetwork === NETWORKS.CARDANO.MAINNET;
        }
        return false;
    };
    const isTestnet = () => !isMainnet();
    const getStorageKeyPrefix = () => `${activeBlockchain}_${activeNetwork}`;

    // Context value - single source of truth
    const value = {
        activeBlockchain,
        activeNetwork,
        isLoading,
        saveBlockchain,
        saveNetwork,
        getAvailableNetworks,
        isBitcoin,
        isCardano,
        isMainnet,
        isTestnet,
        getStorageKeyPrefix,
        BLOCKCHAINS,
        NETWORKS
    };

    return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}
