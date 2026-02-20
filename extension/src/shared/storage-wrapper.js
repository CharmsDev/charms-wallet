/**
 * Storage Wrapper
 *
 * Convenience functions for the extension to read/write wallet data
 * via chrome.storage.local (through StorageAdapter).
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

// ─── Seed phrase ─────────────────────────────────────────────────────
export async function getSeedPhrase() {
    return await StorageAdapter.get(GLOBAL_KEYS.SEED_PHRASE);
}
export async function setSeedPhrase(seedPhrase) {
    await StorageAdapter.set(GLOBAL_KEYS.SEED_PHRASE, seedPhrase);
}
export async function clearSeedPhrase() {
    await StorageAdapter.remove(GLOBAL_KEYS.SEED_PHRASE);
}

// ─── Per-chain data ──────────────────────────────────────────────────
export async function getWalletAddresses(blockchain, network) {
    const data = await StorageAdapter.get(addressesKey(blockchain, network));
    return data ? JSON.parse(data) : [];
}
export async function saveWalletAddresses(blockchain, network, addresses) {
    await StorageAdapter.set(addressesKey(blockchain, network), JSON.stringify(addresses));
}

export async function getUTXOs(blockchain, network) {
    const data = await StorageAdapter.get(utxosKey(blockchain, network));
    return data ? JSON.parse(data) : {};
}
export async function saveUTXOs(blockchain, network, utxos) {
    await StorageAdapter.set(utxosKey(blockchain, network), JSON.stringify(utxos));
}

export async function getTransactions(blockchain, network) {
    const data = await StorageAdapter.get(transactionsKey(blockchain, network));
    return data ? JSON.parse(data) : [];
}
export async function saveTransactions(blockchain, network, transactions) {
    await StorageAdapter.set(transactionsKey(blockchain, network), JSON.stringify(transactions));
}

export async function getCharms(blockchain, network) {
    const data = await StorageAdapter.get(charmsKey(blockchain, network));
    return data ? JSON.parse(data) : [];
}
export async function saveCharms(blockchain, network, charms) {
    await StorageAdapter.set(charmsKey(blockchain, network), JSON.stringify(charms));
}

// ─── Active blockchain / network ─────────────────────────────────────
export async function getActiveBlockchain() {
    return (await StorageAdapter.get(GLOBAL_KEYS.ACTIVE_BLOCKCHAIN)) || 'bitcoin';
}
export async function setActiveBlockchain(blockchain) {
    await StorageAdapter.set(GLOBAL_KEYS.ACTIVE_BLOCKCHAIN, blockchain);
}
export async function getActiveNetwork() {
    return (await StorageAdapter.get(GLOBAL_KEYS.ACTIVE_NETWORK)) || 'mainnet';
}
export async function setActiveNetwork(network) {
    await StorageAdapter.set(GLOBAL_KEYS.ACTIVE_NETWORK, network);
}

// ─── Clear all ───────────────────────────────────────────────────────
export async function clearAllWalletData() {
    const keys = await StorageAdapter.getAllKeys();
    for (const key of keys.filter(isWalletKey)) {
        await StorageAdapter.remove(key);
    }
}
