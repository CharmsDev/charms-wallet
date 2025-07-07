import { UTXOMap, UTXO } from '@/types';
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';

// Local storage keys
export const STORAGE_KEYS = {
    SEED_PHRASE: 'seedPhrase',
    WALLET_INFO: 'wallet_info',
    WALLET_ADDRESSES: 'wallet_addresses',
    UTXOS: 'wallet_utxos',
    ACTIVE_BLOCKCHAIN: 'active_blockchain',
    ACTIVE_NETWORK: 'active_network'
};

export interface AddressEntry {
    address: string;
    index: number;
    created: string;
    isChange?: boolean;  // Identifies change addresses
    privateKey?: string; // For imported addresses
    blockchain?: string; // Identifies which blockchain this address belongs to
}

// Helper function to get the active blockchain and network
const getActiveBlockchainAndNetwork = (): { blockchain: string, network: string } => {
    const blockchain = localStorage.getItem(STORAGE_KEYS.ACTIVE_BLOCKCHAIN) || BLOCKCHAINS.BITCOIN;
    let network;

    if (blockchain === BLOCKCHAINS.BITCOIN) {
        network = localStorage.getItem(STORAGE_KEYS.ACTIVE_NETWORK) || NETWORKS.BITCOIN.TESTNET;
    } else if (blockchain === BLOCKCHAINS.CARDANO) {
        network = localStorage.getItem(STORAGE_KEYS.ACTIVE_NETWORK) || NETWORKS.CARDANO.TESTNET;
    } else {
        network = NETWORKS.BITCOIN.TESTNET;
    }

    return { blockchain, network };
};

// Helper function to get storage key with blockchain and network prefix
const getStorageKey = (key: string, blockchain?: string, network?: string): string => {
    if (!blockchain || !network) {
        const active = getActiveBlockchainAndNetwork();
        blockchain = blockchain || active.blockchain;
        network = network || active.network;
    }
    return `${blockchain}_${network}_${key}`;
};

// Seed phrase storage - seed phrase is shared across blockchains
export const saveSeedPhrase = async (seedPhrase: string): Promise<void> => {
    localStorage.setItem(STORAGE_KEYS.SEED_PHRASE, seedPhrase);
};

export const getSeedPhrase = async (): Promise<string | null> => {
    return localStorage.getItem(STORAGE_KEYS.SEED_PHRASE);
};

export const clearSeedPhrase = async (): Promise<void> => {
    localStorage.removeItem(STORAGE_KEYS.SEED_PHRASE);
};

// Wallet info storage
export const saveWalletInfo = async (walletInfo: any, blockchain?: string, network?: string): Promise<void> => {
    console.log(`💾 [STORAGE] Saving wallet info for ${blockchain}-${network}`);
    const startTime = performance.now();
    const storageKey = getStorageKey(STORAGE_KEYS.WALLET_INFO, blockchain, network);
    localStorage.setItem(storageKey, JSON.stringify(walletInfo));
    console.log(`💾 [STORAGE] Wallet info saved in ${(performance.now() - startTime).toFixed(2)}ms`);
};

export const getWalletInfo = async (blockchain?: string, network?: string): Promise<any | null> => {
    console.log(`💾 [STORAGE] Loading wallet info for ${blockchain}-${network}`);
    const startTime = performance.now();
    const storageKey = getStorageKey(STORAGE_KEYS.WALLET_INFO, blockchain, network);
    const stored = localStorage.getItem(storageKey);
    const result = stored ? JSON.parse(stored) : null;
    console.log(`💾 [STORAGE] Wallet info loaded in ${(performance.now() - startTime).toFixed(2)}ms, found: ${!!result}`);
    return result;
};

export const clearWalletInfo = async (blockchain?: string, network?: string): Promise<void> => {
    const storageKey = getStorageKey(STORAGE_KEYS.WALLET_INFO, blockchain, network);
    localStorage.removeItem(storageKey);
};

// Address storage
export const saveAddresses = async (addresses: AddressEntry[], blockchain?: string, network?: string): Promise<void> => {
    console.log(`💾 [STORAGE] Saving ${addresses.length} addresses for ${blockchain}-${network}`);
    const startTime = performance.now();
    const storageKey = getStorageKey(STORAGE_KEYS.WALLET_ADDRESSES, blockchain, network);
    localStorage.setItem(storageKey, JSON.stringify(addresses));
    console.log(`💾 [STORAGE] Addresses saved in ${(performance.now() - startTime).toFixed(2)}ms`);
};

export const getAddresses = async (blockchain?: string, network?: string): Promise<AddressEntry[]> => {
    console.log(`💾 [STORAGE] Loading addresses for ${blockchain}-${network}`);
    const startTime = performance.now();
    const storageKey = getStorageKey(STORAGE_KEYS.WALLET_ADDRESSES, blockchain, network);
    const stored = localStorage.getItem(storageKey);
    const result = stored ? JSON.parse(stored) : [];
    console.log(`💾 [STORAGE] Addresses loaded in ${(performance.now() - startTime).toFixed(2)}ms, found ${result.length} addresses`);
    return result;
};

export const addAddress = async (address: AddressEntry, blockchain?: string, network?: string): Promise<AddressEntry[]> => {
    const addresses = await getAddresses(blockchain, network);
    const newAddresses = [...addresses, address];
    await saveAddresses(newAddresses, blockchain, network);
    return newAddresses;
};

export const addMultipleAddresses = async (newAddresses: AddressEntry[], blockchain?: string, network?: string): Promise<AddressEntry[]> => {
    const existingAddresses = await getAddresses(blockchain, network);
    const combinedAddresses = [...existingAddresses, ...newAddresses];
    await saveAddresses(combinedAddresses, blockchain, network);
    return combinedAddresses;
};

export const clearAddresses = async (blockchain?: string, network?: string): Promise<void> => {
    const storageKey = getStorageKey(STORAGE_KEYS.WALLET_ADDRESSES, blockchain, network);
    localStorage.removeItem(storageKey);
};

// UTXO storage
export const saveUTXOs = async (utxoMap: UTXOMap, blockchain?: string, network?: string): Promise<void> => {
    const storageKey = getStorageKey(STORAGE_KEYS.UTXOS, blockchain, network);
    localStorage.setItem(storageKey, JSON.stringify(utxoMap));
};

export const getUTXOs = async (blockchain?: string, network?: string): Promise<UTXOMap> => {
    const storageKey = getStorageKey(STORAGE_KEYS.UTXOS, blockchain, network);
    const stored = localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : {};
};

export const clearUTXOs = async (blockchain?: string, network?: string): Promise<void> => {
    const storageKey = getStorageKey(STORAGE_KEYS.UTXOS, blockchain, network);
    localStorage.removeItem(storageKey);
};

// Clear all wallet data for a specific blockchain and network
export const clearBlockchainWalletData = async (blockchain?: string, network?: string): Promise<void> => {
    await clearWalletInfo(blockchain, network);
    await clearAddresses(blockchain, network);
    await clearUTXOs(blockchain, network);
};

// Clear all wallet data across all blockchains and networks
export const clearAllWalletData = async (): Promise<void> => {
    await clearSeedPhrase();

    // Clear Bitcoin data
    await clearBlockchainWalletData(BLOCKCHAINS.BITCOIN, NETWORKS.BITCOIN.MAINNET);
    await clearBlockchainWalletData(BLOCKCHAINS.BITCOIN, NETWORKS.BITCOIN.TESTNET);

    // Clear Cardano data
    await clearBlockchainWalletData(BLOCKCHAINS.CARDANO, NETWORKS.CARDANO.MAINNET);
    await clearBlockchainWalletData(BLOCKCHAINS.CARDANO, NETWORKS.CARDANO.TESTNET);
};
