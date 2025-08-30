import { UTXOMap, UTXO } from '@/types';
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';

// Local storage keys
export const STORAGE_KEYS = {
    SEED_PHRASE: 'seedPhrase',
    WALLET_INFO: 'wallet_info',
    WALLET_ADDRESSES: 'wallet_addresses',
    UTXOS: 'wallet_utxos',
    TRANSACTIONS: 'wallet_transactions',
    CHARMS: 'wallet_charms',
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

export interface TransactionEntry {
    id: string; // unique ID: tx_{timestamp}_{type}_{counter}
    txid: string; // can be duplicate for sent/received pairs
    type: 'sent' | 'received';
    amount: number; // in satoshis
    fee?: number; // only for sent transactions
    timestamp: number;
    status: 'pending' | 'confirmed' | 'failed';
    addresses: {
        from?: string[]; // for sent transactions
        to?: string[]; // for sent transactions
        received?: string; // for received transactions
    };
    blockHeight?: number;
    confirmations?: number;
    metadata?: {
        isSelfSend?: boolean;
        changeAmount?: number;
        totalInputs?: number;
    };
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
    const storageKey = getStorageKey(STORAGE_KEYS.WALLET_INFO, blockchain, network);
    localStorage.setItem(storageKey, JSON.stringify(walletInfo));
};

export const getWalletInfo = async (blockchain?: string, network?: string): Promise<any | null> => {
    const storageKey = getStorageKey(STORAGE_KEYS.WALLET_INFO, blockchain, network);
    const stored = localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : null;
};

export const clearWalletInfo = async (blockchain?: string, network?: string): Promise<void> => {
    const storageKey = getStorageKey(STORAGE_KEYS.WALLET_INFO, blockchain, network);
    localStorage.removeItem(storageKey);
};

// Address storage
export const saveAddresses = async (addresses: AddressEntry[], blockchain?: string, network?: string): Promise<void> => {
    const storageKey = getStorageKey(STORAGE_KEYS.WALLET_ADDRESSES, blockchain, network);
    localStorage.setItem(storageKey, JSON.stringify(addresses));
};

export const getAddresses = async (blockchain?: string, network?: string): Promise<AddressEntry[]> => {
    const storageKey = getStorageKey(STORAGE_KEYS.WALLET_ADDRESSES, blockchain, network);
    const stored = localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : [];
};

export const addAddress = async (address: AddressEntry, blockchain?: string, network?: string): Promise<AddressEntry[]> => {
    const addresses = await getAddresses(blockchain, network);
    addresses.push(address);
    await saveAddresses(addresses, blockchain, network);
    return addresses;
};

export const addMultipleAddresses = async (newAddresses: AddressEntry[], blockchain?: string, network?: string): Promise<AddressEntry[]> => {
    const addresses = await getAddresses(blockchain, network);
    addresses.push(...newAddresses);
    await saveAddresses(addresses, blockchain, network);
    return addresses;
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
    const result = stored ? JSON.parse(stored) : {};
    
    
    return result;
};

export const clearUTXOs = async (blockchain?: string, network?: string): Promise<void> => {
    const storageKey = getStorageKey(STORAGE_KEYS.UTXOS, blockchain, network);
    localStorage.removeItem(storageKey);
};

// Transaction storage
export const saveTransactions = async (transactions: TransactionEntry[], blockchain?: string, network?: string): Promise<void> => {
    const storageKey = getStorageKey(STORAGE_KEYS.TRANSACTIONS, blockchain, network);
    localStorage.setItem(storageKey, JSON.stringify(transactions));
};

export const getTransactions = async (blockchain?: string, network?: string): Promise<TransactionEntry[]> => {
    const storageKey = getStorageKey(STORAGE_KEYS.TRANSACTIONS, blockchain, network);
    const stored = localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : [];
};

export const addTransaction = async (transaction: TransactionEntry, blockchain?: string, network?: string): Promise<TransactionEntry[]> => {
    const transactions = await getTransactions(blockchain, network);
    const existingIndex = transactions.findIndex(tx => 
        tx.id === transaction.id || (tx.txid === transaction.txid && tx.type === transaction.type)
    );

    if (existingIndex >= 0) {
        transactions[existingIndex] = transaction;
    } else {
        transactions.push(transaction);
    }

    transactions.sort((a, b) => b.timestamp - a.timestamp);
    await saveTransactions(transactions, blockchain, network);
    
    return transactions;
};

export const updateTransactionStatus = async (txid: string, status: TransactionEntry['status'], confirmations: number, blockchain?: string, network?: string): Promise<TransactionEntry[]> => {
    const transactions = await getTransactions(blockchain, network);
    const txIndex = transactions.findIndex(tx => tx.txid === txid);
    
    if (txIndex >= 0) {
        transactions[txIndex].status = status;
        transactions[txIndex].confirmations = confirmations;
        await saveTransactions(transactions, blockchain, network);
    }
    
    return transactions;
};

export const clearTransactions = async (blockchain?: string, network?: string): Promise<void> => {
    const storageKey = getStorageKey(STORAGE_KEYS.TRANSACTIONS, blockchain, network);
    localStorage.removeItem(storageKey);
};

// Clear all wallet data for a specific blockchain and network
export const clearBlockchainWalletData = async (blockchain?: string, network?: string): Promise<void> => {
    await clearWalletInfo(blockchain, network);
    await clearAddresses(blockchain, network);
    await clearUTXOs(blockchain, network);
    await clearTransactions(blockchain, network);
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
    
    // Also clear any legacy keys that might exist
    const allKeys = Object.keys(localStorage);
    const walletKeys = allKeys.filter(key => 
        key.includes('wallet') || 
        key.includes('utxo') || 
        key.includes('address') || 
        key.includes('transaction') ||
        key.includes('bitcoin') ||
        key.includes('pending')
    );
    
    walletKeys.forEach(key => localStorage.removeItem(key));
};

// Charms storage functions
export const saveCharms = async (charms: any[], blockchain: string = BLOCKCHAINS.BITCOIN, network: string = NETWORKS.BITCOIN.TESTNET): Promise<void> => {
    try {
        const key = `${blockchain}_${network}_${STORAGE_KEYS.CHARMS}`;
        const charmsData = {
            charms,
            timestamp: Date.now(),
            count: charms.length
        };
        localStorage.setItem(key, JSON.stringify(charmsData));
        console.log(`[STORAGE] Saved ${charms.length} charms to ${key}`);
    } catch (error) {
        console.error('[STORAGE] Failed to save charms:', error);
        throw error;
    }
};

export const getCharms = async (blockchain: string = BLOCKCHAINS.BITCOIN, network: string = NETWORKS.BITCOIN.TESTNET): Promise<any[]> => {
    try {
        const key = `${blockchain}_${network}_${STORAGE_KEYS.CHARMS}`;
        const stored = localStorage.getItem(key);
        
        if (!stored) {
            console.log(`[STORAGE] No charms found for ${key}`);
            return [];
        }

        const charmsData = JSON.parse(stored);
        console.log(`[STORAGE] Loaded ${charmsData.count || 0} charms from ${key}`);
        return charmsData.charms || [];
    } catch (error) {
        console.error('[STORAGE] Failed to load charms:', error);
        return [];
    }
};
