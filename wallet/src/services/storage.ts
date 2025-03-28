import { UTXOMap, UTXO } from '@/types';

// Local storage keys
export const STORAGE_KEYS = {
    SEED_PHRASE: 'seedPhrase',
    WALLET_ADDRESSES: 'wallet_addresses',
    UTXOS: 'wallet_utxos'
};

export interface AddressEntry {
    address: string;
    index: number;
    created: string;
    isChange?: boolean;  // Identifies change addresses
    privateKey?: string; // For imported addresses
}

// Seed phrase storage
export const saveSeedPhrase = async (seedPhrase: string): Promise<void> => {
    localStorage.setItem(STORAGE_KEYS.SEED_PHRASE, seedPhrase);
};

export const getSeedPhrase = async (): Promise<string | null> => {
    return localStorage.getItem(STORAGE_KEYS.SEED_PHRASE);
};

export const clearSeedPhrase = async (): Promise<void> => {
    localStorage.removeItem(STORAGE_KEYS.SEED_PHRASE);
};

// Address storage
export const saveAddresses = async (addresses: AddressEntry[]): Promise<void> => {
    localStorage.setItem(STORAGE_KEYS.WALLET_ADDRESSES, JSON.stringify(addresses));
};

export const getAddresses = async (): Promise<AddressEntry[]> => {
    const stored = localStorage.getItem(STORAGE_KEYS.WALLET_ADDRESSES);
    return stored ? JSON.parse(stored) : [];
};

export const addAddress = async (address: AddressEntry): Promise<AddressEntry[]> => {
    const addresses = await getAddresses();
    const newAddresses = [...addresses, address];
    await saveAddresses(newAddresses);
    return newAddresses;
};

export const deleteAddress = async (addressToDelete: string): Promise<AddressEntry[]> => {
    const addresses = await getAddresses();
    const newAddresses = addresses.filter(addr => addr.address !== addressToDelete);
    await saveAddresses(newAddresses);
    return newAddresses;
};

export const clearAddresses = async (): Promise<void> => {
    localStorage.removeItem(STORAGE_KEYS.WALLET_ADDRESSES);
};

// UTXO storage
export const saveUTXOs = async (utxoMap: UTXOMap): Promise<void> => {
    localStorage.setItem(STORAGE_KEYS.UTXOS, JSON.stringify(utxoMap));
};

export const getUTXOs = async (): Promise<UTXOMap> => {
    const stored = localStorage.getItem(STORAGE_KEYS.UTXOS);
    return stored ? JSON.parse(stored) : {};
};

export const clearUTXOs = async (): Promise<void> => {
    localStorage.removeItem(STORAGE_KEYS.UTXOS);
};

// Clear all wallet data
export const clearAllWalletData = async (): Promise<void> => {
    await clearSeedPhrase();
    await clearAddresses();
    await clearUTXOs();
};
