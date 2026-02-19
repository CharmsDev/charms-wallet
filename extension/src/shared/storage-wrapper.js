/**
 * Storage wrapper that adapts wallet's storage.ts to use StorageAdapter
 * This allows the extension to use chrome.storage.local instead of localStorage
 */
import { StorageAdapter } from './storage-adapter';

// Re-export storage keys from wallet
export const STORAGE_KEYS = {
    SEED_PHRASE: 'seedPhrase',
    WALLET_INFO: 'wallet_info',
    WALLET_ADDRESSES: 'wallet_addresses',
    UTXOS: 'wallet_utxos',
    TRANSACTIONS: 'wallet_transactions',
    CHARMS: 'wallet_charms',
    BALANCE: 'balance',
    ACTIVE_BLOCKCHAIN: 'active_blockchain',
    ACTIVE_NETWORK: 'active_network'
};

// Override wallet storage functions to use StorageAdapter
export async function getSeedPhrase() {
    return await StorageAdapter.get(STORAGE_KEYS.SEED_PHRASE);
}

export async function setSeedPhrase(seedPhrase) {
    await StorageAdapter.set(STORAGE_KEYS.SEED_PHRASE, seedPhrase);
}

export async function clearSeedPhrase() {
    await StorageAdapter.remove(STORAGE_KEYS.SEED_PHRASE);
}

export async function getWalletAddresses(blockchain, network) {
    const key = `${STORAGE_KEYS.WALLET_ADDRESSES}_${blockchain}_${network}`;
    const data = await StorageAdapter.get(key);
    return data ? JSON.parse(data) : [];
}

export async function saveWalletAddresses(blockchain, network, addresses) {
    const key = `${STORAGE_KEYS.WALLET_ADDRESSES}_${blockchain}_${network}`;
    await StorageAdapter.set(key, JSON.stringify(addresses));
}

export async function getUTXOs(blockchain, network) {
    const key = `${STORAGE_KEYS.UTXOS}_${blockchain}_${network}`;
    const data = await StorageAdapter.get(key);
    return data ? JSON.parse(data) : {};
}

export async function saveUTXOs(blockchain, network, utxos) {
    const key = `${STORAGE_KEYS.UTXOS}_${blockchain}_${network}`;
    await StorageAdapter.set(key, JSON.stringify(utxos));
}

export async function getTransactions(blockchain, network) {
    const key = `${STORAGE_KEYS.TRANSACTIONS}_${blockchain}_${network}`;
    const data = await StorageAdapter.get(key);
    return data ? JSON.parse(data) : [];
}

export async function saveTransactions(blockchain, network, transactions) {
    const key = `${STORAGE_KEYS.TRANSACTIONS}_${blockchain}_${network}`;
    await StorageAdapter.set(key, JSON.stringify(transactions));
}

export async function getCharms(blockchain, network) {
    const key = `${STORAGE_KEYS.CHARMS}_${blockchain}_${network}`;
    const data = await StorageAdapter.get(key);
    return data ? JSON.parse(data) : [];
}

export async function saveCharms(blockchain, network, charms) {
    const key = `${STORAGE_KEYS.CHARMS}_${blockchain}_${network}`;
    await StorageAdapter.set(key, JSON.stringify(charms));
}

export async function getActiveBlockchain() {
    const blockchain = await StorageAdapter.get(STORAGE_KEYS.ACTIVE_BLOCKCHAIN);
    return blockchain || 'bitcoin';
}

export async function setActiveBlockchain(blockchain) {
    await StorageAdapter.set(STORAGE_KEYS.ACTIVE_BLOCKCHAIN, blockchain);
}

export async function getActiveNetwork() {
    const network = await StorageAdapter.get(STORAGE_KEYS.ACTIVE_NETWORK);
    return network || 'testnet4';
}

export async function setActiveNetwork(network) {
    await StorageAdapter.set(STORAGE_KEYS.ACTIVE_NETWORK, network);
}

export async function clearAllWalletData() {
    const keys = await StorageAdapter.getAllKeys();
    const walletKeys = keys.filter(key => 
        key.startsWith('wallet_') || 
        key === STORAGE_KEYS.SEED_PHRASE ||
        key === STORAGE_KEYS.BALANCE
    );
    
    for (const key of walletKeys) {
        await StorageAdapter.remove(key);
    }
}

// Utility to migrate from localStorage to chrome.storage if needed
export async function migrateFromLocalStorage() {
    if (typeof window === 'undefined' || !window.localStorage) {
        return;
    }

    const keysToMigrate = Object.values(STORAGE_KEYS);
    
    for (const key of keysToMigrate) {
        const localValue = window.localStorage.getItem(key);
        if (localValue) {
            await StorageAdapter.set(key, localValue);
            window.localStorage.removeItem(key);
        }
    }

    // Migrate network-specific keys
    for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && (key.startsWith('wallet_') || key.startsWith('balance_'))) {
            const value = window.localStorage.getItem(key);
            if (value) {
                await StorageAdapter.set(key, value);
                window.localStorage.removeItem(key);
            }
        }
    }
}
