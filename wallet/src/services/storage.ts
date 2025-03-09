// Unified storage service for the wallet application
// Handles all localStorage operations in a centralized way

// Storage keys
export const STORAGE_KEYS = {
    SEED_PHRASE: 'seedPhrase',
    WALLET_ADDRESSES: 'wallet_addresses'
};

// Type definitions
export interface AddressEntry {
    address: string;
    index: number;
    created: string;
    privateKey?: string; // Optional private key for imported addresses
}

// Seed phrase storage functions

// Saves the seed phrase to local storage
export const saveSeedPhrase = async (seedPhrase: string): Promise<void> => {
    localStorage.setItem(STORAGE_KEYS.SEED_PHRASE, seedPhrase);
};

// Retrieves the seed phrase from local storage
export const getSeedPhrase = async (): Promise<string | null> => {
    return localStorage.getItem(STORAGE_KEYS.SEED_PHRASE);
};

// Removes the seed phrase from local storage
export const clearSeedPhrase = async (): Promise<void> => {
    localStorage.removeItem(STORAGE_KEYS.SEED_PHRASE);
};

// Address storage functions

// Saves addresses to local storage
export const saveAddresses = async (addresses: AddressEntry[]): Promise<void> => {
    localStorage.setItem(STORAGE_KEYS.WALLET_ADDRESSES, JSON.stringify(addresses));
};

// Retrieves addresses from local storage
export const getAddresses = async (): Promise<AddressEntry[]> => {
    const stored = localStorage.getItem(STORAGE_KEYS.WALLET_ADDRESSES);
    return stored ? JSON.parse(stored) : [];
};

// Adds a new address to storage
export const addAddress = async (address: AddressEntry): Promise<AddressEntry[]> => {
    const addresses = await getAddresses();
    const newAddresses = [...addresses, address];
    await saveAddresses(newAddresses);
    return newAddresses;
};

// Delete address
export const deleteAddress = async (addressToDelete: string): Promise<AddressEntry[]> => {
    const addresses = await getAddresses();
    const newAddresses = addresses.filter(addr => addr.address !== addressToDelete);
    await saveAddresses(newAddresses);
    return newAddresses;
};

// Clear addresses
export const clearAddresses = async (): Promise<void> => {
    localStorage.removeItem(STORAGE_KEYS.WALLET_ADDRESSES);
};

// General storage utility functions

// Clear all wallet data
export const clearAllWalletData = async (): Promise<void> => {
    await clearSeedPhrase();
    await clearAddresses();
};
