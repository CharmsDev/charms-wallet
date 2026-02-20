/**
 * Storage wrapper that adapts wallet's storage.ts to use StorageAdapter
 * This allows the extension to use chrome.storage.local instead of localStorage
 */
import { StorageAdapter } from './storage-adapter';
import {
    GLOBAL_KEYS,
    addressesKey,
    utxosKey,
    transactionsKey,
    charmsKey,
    isWalletKey,
} from '@/services/storage-keys';

// Re-export for backward compatibility
export const STORAGE_KEYS = GLOBAL_KEYS;

// Override wallet storage functions to use StorageAdapter
export async function getSeedPhrase() {
    return await StorageAdapter.get(GLOBAL_KEYS.SEED_PHRASE);
}

export async function setSeedPhrase(seedPhrase) {
    await StorageAdapter.set(GLOBAL_KEYS.SEED_PHRASE, seedPhrase);
}

export async function clearSeedPhrase() {
    await StorageAdapter.remove(GLOBAL_KEYS.SEED_PHRASE);
}

export async function getWalletAddresses(blockchain, network) {
    const key = addressesKey(blockchain, network);
    const data = await StorageAdapter.get(key);
    return data ? JSON.parse(data) : [];
}

export async function saveWalletAddresses(blockchain, network, addresses) {
    const key = addressesKey(blockchain, network);
    await StorageAdapter.set(key, JSON.stringify(addresses));
}

export async function getUTXOs(blockchain, network) {
    const key = utxosKey(blockchain, network);
    const data = await StorageAdapter.get(key);
    return data ? JSON.parse(data) : {};
}

export async function saveUTXOs(blockchain, network, utxos) {
    const key = utxosKey(blockchain, network);
    await StorageAdapter.set(key, JSON.stringify(utxos));
}

export async function getTransactions(blockchain, network) {
    const key = transactionsKey(blockchain, network);
    const data = await StorageAdapter.get(key);
    return data ? JSON.parse(data) : [];
}

export async function saveTransactions(blockchain, network, transactions) {
    const key = transactionsKey(blockchain, network);
    await StorageAdapter.set(key, JSON.stringify(transactions));
}

export async function getCharms(blockchain, network) {
    const key = charmsKey(blockchain, network);
    const data = await StorageAdapter.get(key);
    return data ? JSON.parse(data) : [];
}

export async function saveCharms(blockchain, network, charms) {
    const key = charmsKey(blockchain, network);
    await StorageAdapter.set(key, JSON.stringify(charms));
}

export async function getActiveBlockchain() {
    const blockchain = await StorageAdapter.get(GLOBAL_KEYS.ACTIVE_BLOCKCHAIN);
    return blockchain || 'bitcoin';
}

export async function setActiveBlockchain(blockchain) {
    await StorageAdapter.set(GLOBAL_KEYS.ACTIVE_BLOCKCHAIN, blockchain);
}

export async function getActiveNetwork() {
    const network = await StorageAdapter.get(GLOBAL_KEYS.ACTIVE_NETWORK);
    return network || 'testnet4';
}

export async function setActiveNetwork(network) {
    await StorageAdapter.set(GLOBAL_KEYS.ACTIVE_NETWORK, network);
}

export async function clearAllWalletData() {
    const keys = await StorageAdapter.getAllKeys();
    const walletKeys = keys.filter(key => isWalletKey(key));
    
    for (const key of walletKeys) {
        await StorageAdapter.remove(key);
    }
}

// Utility to migrate from localStorage to chrome.storage if needed
export async function migrateFromLocalStorage() {
    if (typeof window === 'undefined' || !window.localStorage) {
        return;
    }

    // Migrate all wallet-prefixed keys
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
        const key = window.localStorage.key(i);
        if (key && isWalletKey(key)) {
            const value = window.localStorage.getItem(key);
            if (value) {
                await StorageAdapter.set(key, value);
                window.localStorage.removeItem(key);
            }
        }
    }
}
