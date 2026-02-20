import { UTXOMap, UTXO } from '@/types';
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';
import { StorageAdapter } from './storage-adapter';
import {
    GLOBAL_KEYS,
    DATA_TYPES,
    chainKey,
    addressesKey,
    utxosKey,
    transactionsKey,
    charmsKey,
    infoKey,
    chainPrefix,
    isWalletKey,
} from './storage-keys';

// Re-export for backward compatibility (consumers that import STORAGE_KEYS)
export const STORAGE_KEYS = {
    SEED_PHRASE: GLOBAL_KEYS.SEED_PHRASE,
    WALLET_INFO: DATA_TYPES.INFO,
    WALLET_ADDRESSES: DATA_TYPES.ADDRESSES,
    UTXOS: DATA_TYPES.UTXOS,
    TRANSACTIONS: DATA_TYPES.TRANSACTIONS,
    CHARMS: DATA_TYPES.CHARMS,
    BALANCE: GLOBAL_KEYS.BALANCE,
    ACTIVE_BLOCKCHAIN: GLOBAL_KEYS.ACTIVE_BLOCKCHAIN,
    ACTIVE_NETWORK: GLOBAL_KEYS.ACTIVE_NETWORK
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
    type: 'sent' | 'received' | 'bro_mining' | 'bro_mint' | 'charm_transfer' | 'charm_consolidation' | 'charm_self_transfer';
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
        // Charm/Token specific metadata
        isCharmTransfer?: boolean;
        isCharmConsolidation?: boolean;
        isCharmSelfTransfer?: boolean;
        charmAmount?: number;
        charmName?: string;
        ticker?: string;
        inputUtxoCount?: number;
        outputUtxoCount?: number;
    };
}

// Helper function to get the active blockchain and network
const getActiveBlockchainAndNetwork = async (): Promise<{ blockchain: string, network: string }> => {
    const blockchain = await StorageAdapter.get(GLOBAL_KEYS.ACTIVE_BLOCKCHAIN) || BLOCKCHAINS.BITCOIN;
    let network;

    if (blockchain === BLOCKCHAINS.BITCOIN) {
        network = await StorageAdapter.get(GLOBAL_KEYS.ACTIVE_NETWORK) || NETWORKS.BITCOIN.TESTNET;
    } else if (blockchain === BLOCKCHAINS.CARDANO) {
        network = await StorageAdapter.get(GLOBAL_KEYS.ACTIVE_NETWORK) || NETWORKS.CARDANO.TESTNET;
    } else {
        network = NETWORKS.BITCOIN.TESTNET;
    }

    return { blockchain, network };
};

// Resolve blockchain+network, then build a per-chain key
const resolveChainKey = async (dataType: string, blockchain?: string, network?: string): Promise<string> => {
    if (!blockchain || !network) {
        const active = await getActiveBlockchainAndNetwork();
        blockchain = blockchain || active.blockchain;
        network = network || active.network;
    }
    return chainKey(blockchain, network, dataType);
};

// Seed phrase storage - seed phrase is shared across blockchains
export const saveSeedPhrase = async (seedPhrase: string): Promise<void> => {
    await StorageAdapter.set(GLOBAL_KEYS.SEED_PHRASE, seedPhrase);
};

export const getSeedPhrase = async (): Promise<string | null> => {
    return await StorageAdapter.get(GLOBAL_KEYS.SEED_PHRASE);
};

export const clearSeedPhrase = async (): Promise<void> => {
    await StorageAdapter.remove(GLOBAL_KEYS.SEED_PHRASE);
};

// Wallet info storage
export const saveWalletInfo = async (walletInfo: any, blockchain?: string, network?: string): Promise<void> => {
    const storageKey = await resolveChainKey(DATA_TYPES.INFO, blockchain, network);
    await StorageAdapter.set(storageKey, JSON.stringify(walletInfo));
};

export const getWalletInfo = async (blockchain?: string, network?: string): Promise<any | null> => {
    const storageKey = await resolveChainKey(DATA_TYPES.INFO, blockchain, network);
    const data = await StorageAdapter.get(storageKey);
    return data ? JSON.parse(data) : null;
};

export const clearWalletInfo = async (blockchain?: string, network?: string): Promise<void> => {
    const storageKey = await resolveChainKey(DATA_TYPES.INFO, blockchain, network);
    await StorageAdapter.remove(storageKey);
};

// Wallet addresses storage
export const saveAddresses = async (addresses: AddressEntry[], blockchain?: string, network?: string): Promise<void> => {
    const storageKey = await resolveChainKey(DATA_TYPES.ADDRESSES, blockchain, network);
    await StorageAdapter.set(storageKey, JSON.stringify(addresses));
};

export const getAddresses = async (blockchain?: string, network?: string): Promise<AddressEntry[]> => {
    const storageKey = await resolveChainKey(DATA_TYPES.ADDRESSES, blockchain, network);
    const data = await StorageAdapter.get(storageKey);
    return data ? JSON.parse(data) : [];
};

export const addAddress = async (address: AddressEntry, blockchain?: string, network?: string): Promise<AddressEntry[]> => {
    const addresses = await getAddresses(blockchain, network);
    addresses.push(address);
    await saveAddresses(addresses, blockchain, network);
    return addresses;
};

export const clearAddresses = async (blockchain?: string, network?: string): Promise<void> => {
    const storageKey = await resolveChainKey(DATA_TYPES.ADDRESSES, blockchain, network);
    await StorageAdapter.remove(storageKey);
};

// UTXO storage
export const saveUTXOs = async (utxos: UTXOMap, blockchain?: string, network?: string): Promise<void> => {
    const storageKey = await resolveChainKey(DATA_TYPES.UTXOS, blockchain, network);
    await StorageAdapter.set(storageKey, JSON.stringify(utxos));
};

export const getUTXOs = async (blockchain?: string, network?: string): Promise<UTXOMap> => {
    const storageKey = await resolveChainKey(DATA_TYPES.UTXOS, blockchain, network);
    const data = await StorageAdapter.get(storageKey);
    return data ? JSON.parse(data) : {};
};

export const clearUTXOs = async (blockchain?: string, network?: string): Promise<void> => {
    const storageKey = await resolveChainKey(DATA_TYPES.UTXOS, blockchain, network);
    await StorageAdapter.remove(storageKey);
};

// Transaction storage
export const saveTransactions = async (transactions: TransactionEntry[], blockchain?: string, network?: string): Promise<void> => {
    const storageKey = await resolveChainKey(DATA_TYPES.TRANSACTIONS, blockchain, network);
    await StorageAdapter.set(storageKey, JSON.stringify(transactions));
};

export const getTransactions = async (blockchain?: string, network?: string): Promise<TransactionEntry[]> => {
    const storageKey = await resolveChainKey(DATA_TYPES.TRANSACTIONS, blockchain, network);
    const stored = await StorageAdapter.get(storageKey);
    return stored ? JSON.parse(stored) : [];
};

export const addTransaction = async (transaction: TransactionEntry, blockchain?: string, network?: string): Promise<TransactionEntry[]> => {
    
    const transactions = await getTransactions(blockchain, network);
    
    // Check if transaction already exists by txid + type
    const existingByTxid = transactions.findIndex(tx => 
        tx.txid === transaction.txid && tx.type === transaction.type
    );
    
    if (existingByTxid >= 0) {
        // For charm transactions, update metadata if new transaction has more complete data
        const isCharmTx = transaction.type === 'charm_transfer' || 
                          transaction.type === 'charm_consolidation' || 
                          transaction.type === 'charm_self_transfer';
        const hasNewMetadata = transaction.metadata?.inputUtxoCount !== undefined || 
                               transaction.metadata?.outputUtxoCount !== undefined;
        
        const existingHasMetadata = transactions[existingByTxid].metadata?.inputUtxoCount !== undefined || 
                                    transactions[existingByTxid].metadata?.outputUtxoCount !== undefined;
        
        if (isCharmTx && hasNewMetadata) {
            // Complete replacement for charm transactions to ensure fresh data
            transactions[existingByTxid] = { 
                ...transaction,  // Use new transaction data completely
                id: transactions[existingByTxid].id  // Keep original ID to maintain consistency
            };
            // Fall through to save the updated transaction
        } else {
            return transactions; // Don't update, just return existing
        }
    } else {
        // Check if we're updating by exact ID
        const existingById = transactions.findIndex(tx => tx.id === transaction.id);
        
        if (existingById >= 0) {
            transactions[existingById] = transaction;
        } else {
            transactions.push(transaction);
        }
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
    const storageKey = await resolveChainKey(DATA_TYPES.TRANSACTIONS, blockchain, network);
    await StorageAdapter.remove(storageKey);
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
    
    // Clear all wallet-prefixed keys from storage
    const allKeys = await StorageAdapter.getAllKeys();
    const walletKeys = allKeys.filter(key => isWalletKey(key));
    
    for (const key of walletKeys) {
        await StorageAdapter.remove(key);
    }
};

// Charms storage functions
export const saveCharms = async (charms: any[], blockchain: string = BLOCKCHAINS.BITCOIN, network: string = NETWORKS.BITCOIN.TESTNET): Promise<void> => {
    try {
        const key = charmsKey(blockchain, network);
        const charmsData = {
            charms,
            timestamp: Date.now(),
            count: charms.length
        };
        await StorageAdapter.set(key, JSON.stringify(charmsData));
    } catch (error) {
        throw error;
    }
};

export const getCharms = async (blockchain: string = BLOCKCHAINS.BITCOIN, network: string = NETWORKS.BITCOIN.TESTNET): Promise<any[]> => {
    try {
        const key = charmsKey(blockchain, network);
        const stored = await StorageAdapter.get(key);
        
        if (!stored) {
            return [];
        }

        const charmsData = JSON.parse(stored);
        return charmsData.charms || [];
    } catch (error) {
        return [];
    }
};

// Balance storage - centralized balance storage with extended stats
// Single localStorage key: "balance" contains all balances for all networks
export interface TokenBalance {
    appId: string;
    ticker: string;
    name: string;
    amount: number;
    utxoCount: number;
}

export interface BalanceData {
    // Bitcoin balances (in satoshis)
    bitcoin: {
        spendable: number;
        pending: number;
        nonSpendable: number;
        total: number;
    };
    // Counts
    counts: {
        utxos: number;
        charms: number;
        ordinals: number;
        runes: number;
    };
    // Token balances (BRO, etc.)
    tokens: TokenBalance[];
    // Metadata
    timestamp: number;
}

export const saveBalance = async (
    blockchain: string, 
    network: string, 
    data: {
        spendable: number;
        pending: number;
        nonSpendable: number;
        utxoCount: number;
        charmCount: number;
        ordinalCount: number;
        runeCount: number;
        tokens?: TokenBalance[];
    }
): Promise<void> => {
    try {
        const stored = await StorageAdapter.get(GLOBAL_KEYS.BALANCE);
        const balances = stored ? JSON.parse(stored) : {};
        
        if (!balances[blockchain]) {
            balances[blockchain] = {};
        }
        
        // Unified structure
        balances[blockchain][network] = {
            bitcoin: {
                spendable: data.spendable,
                pending: data.pending,
                nonSpendable: data.nonSpendable,
                total: data.spendable + data.pending + data.nonSpendable
            },
            counts: {
                utxos: data.utxoCount,
                charms: data.charmCount,
                ordinals: data.ordinalCount,
                runes: data.runeCount
            },
            tokens: data.tokens || [],
            timestamp: Date.now()
        };
        
        await StorageAdapter.set(GLOBAL_KEYS.BALANCE, JSON.stringify(balances));
    } catch (error) {
    }
};

export const getBalance = async (blockchain: string, network: string): Promise<BalanceData | null> => {
    try {
        const stored = await StorageAdapter.get(GLOBAL_KEYS.BALANCE);
        
        if (!stored) {
            return null;
        }
        
        const balances = JSON.parse(stored);
        const result = balances[blockchain]?.[network] || null;
        
        return result;
    } catch (error) {
        return null;
    }
};
