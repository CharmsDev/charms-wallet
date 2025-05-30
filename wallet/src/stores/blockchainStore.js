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
        TESTNET: 'testnet'
    },
    CARDANO: {
        MAINNET: 'mainnet',
        TESTNET: 'preprod' // Cardano testnet is called "preprod"
    }
};

// Local storage keys
const STORAGE_KEYS = {
    ACTIVE_BLOCKCHAIN: 'active_blockchain',
    ACTIVE_NETWORK: 'active_network'
};

// Create context
const BlockchainContext = createContext();

// Use blockchain context hook
export const useBlockchain = () => {
    const context = useContext(BlockchainContext);
    if (!context) {
        throw new Error('useBlockchain must be used within a BlockchainProvider');
    }
    return context;
};

// Provider component
export function BlockchainProvider({ children }) {
    // State for active blockchain and network
    const [activeBlockchain, setActiveBlockchain] = useState(BLOCKCHAINS.BITCOIN);
    const [activeNetwork, setActiveNetwork] = useState(NETWORKS.BITCOIN.TESTNET);
    const [isLoading, setIsLoading] = useState(true);

    // Load saved blockchain and network preferences on mount
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
                    setActiveNetwork(NETWORKS.CARDANO.TESTNET);
                } else {
                    setActiveNetwork(NETWORKS.BITCOIN.TESTNET);
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

        // Update network to match the blockchain's default testnet
        if (blockchain === BLOCKCHAINS.BITCOIN) {
            setActiveNetwork(NETWORKS.BITCOIN.TESTNET);
            localStorage.setItem(STORAGE_KEYS.ACTIVE_NETWORK, NETWORKS.BITCOIN.TESTNET);
        } else if (blockchain === BLOCKCHAINS.CARDANO) {
            setActiveNetwork(NETWORKS.CARDANO.TESTNET);
            localStorage.setItem(STORAGE_KEYS.ACTIVE_NETWORK, NETWORKS.CARDANO.TESTNET);
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

    // Check if the current blockchain is Bitcoin
    const isBitcoin = () => activeBlockchain === BLOCKCHAINS.BITCOIN;

    // Check if the current blockchain is Cardano
    const isCardano = () => activeBlockchain === BLOCKCHAINS.CARDANO;

    // Check if the current network is mainnet
    const isMainnet = () => {
        if (isBitcoin()) {
            return activeNetwork === NETWORKS.BITCOIN.MAINNET;
        } else if (isCardano()) {
            return activeNetwork === NETWORKS.CARDANO.MAINNET;
        }
        return false;
    };

    // Check if the current network is testnet
    const isTestnet = () => !isMainnet();

    // Get storage key prefix for the current blockchain and network
    const getStorageKeyPrefix = () => {
        return `${activeBlockchain}_${activeNetwork}`;
    };

    // Context value
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

    return <BlockchainContext.Provider value={value}>{children}</BlockchainContext.Provider>;
}
