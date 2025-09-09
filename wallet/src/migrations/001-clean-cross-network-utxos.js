/**
 * Migration 001: Clean Cross-Network UTXO Contamination
 * 
 * This migration fixes the issue where UTXOs from different networks
 * (mainnet vs testnet) get mixed in localStorage, causing transaction failures.
 * 
 * Problem: UTXOs with testnet addresses (tb1...) appearing in mainnet storage
 * and vice versa, leading to "Insufficient verified UTXOs" errors.
 */

import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';

const migration = {
    id: '001-clean-cross-network-utxos',
    description: 'Clean cross-network UTXO contamination from localStorage',
    version: '1.0.0',
    
    async execute() {
        console.log('[MIGRATION 001] Starting cross-network UTXO cleanup...');
        
        const networks = [
            { blockchain: BLOCKCHAINS.BITCOIN, network: NETWORKS.BITCOIN.MAINNET, prefix: 'bc1' },
            { blockchain: BLOCKCHAINS.BITCOIN, network: NETWORKS.BITCOIN.TESTNET, prefix: 'tb1' },
            { blockchain: BLOCKCHAINS.BITCOIN, network: NETWORKS.BITCOIN.REGTEST, prefix: 'bcrt1' }
        ];
        
        let totalCleaned = 0;
        
        for (const { blockchain, network, prefix } of networks) {
            const storageKey = `${blockchain}_${network}_wallet_utxos`;
            console.log(`[MIGRATION 001] Processing ${storageKey}...`);
            
            try {
                const stored = localStorage.getItem(storageKey);
                if (!stored) {
                    console.log(`[MIGRATION 001] No UTXOs found for ${storageKey}`);
                    continue;
                }
                
                const utxos = JSON.parse(stored);
                const cleanedUtxos = {};
                let removedCount = 0;
                
                // Filter out addresses that don't match the expected network prefix
                Object.entries(utxos).forEach(([address, addressUtxos]) => {
                    if (address.startsWith(prefix)) {
                        cleanedUtxos[address] = addressUtxos;
                    } else {
                        console.log(`[MIGRATION 001] Removing cross-network address: ${address} from ${network} (expected ${prefix})`);
                        removedCount++;
                    }
                });
                
                if (removedCount > 0) {
                    // Save cleaned UTXOs back to localStorage
                    localStorage.setItem(storageKey, JSON.stringify(cleanedUtxos));
                    console.log(`[MIGRATION 001] Cleaned ${removedCount} cross-network addresses from ${network}`);
                    totalCleaned += removedCount;
                } else {
                    console.log(`[MIGRATION 001] No cross-network contamination found in ${network}`);
                }
                
            } catch (error) {
                console.error(`[MIGRATION 001] Error processing ${storageKey}:`, error);
            }
        }
        
        console.log(`[MIGRATION 001] Cleanup completed. Total addresses cleaned: ${totalCleaned}`);
        
        // Also clean any orphaned UTXO keys that might exist
        await this.cleanOrphanedUtxoKeys();
    },
    
    async cleanOrphanedUtxoKeys() {
        console.log('[MIGRATION 001] Checking for orphaned UTXO keys...');
        
        const utxoKeyPattern = /^(bitcoin|cardano)_(mainnet|testnet|regtest)_wallet_utxos$/;
        const keysToCheck = [];
        
        // Scan localStorage for UTXO-related keys
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && utxoKeyPattern.test(key)) {
                keysToCheck.push(key);
            }
        }
        
        console.log(`[MIGRATION 001] Found ${keysToCheck.length} UTXO storage keys to validate`);
        
        for (const key of keysToCheck) {
            try {
                const data = localStorage.getItem(key);
                if (data) {
                    const parsed = JSON.parse(data);
                    
                    // Check if it's a valid UTXO structure
                    if (typeof parsed === 'object' && parsed !== null) {
                        let hasValidStructure = true;
                        
                        // Validate structure: should be { address: [utxos] }
                        for (const [address, utxos] of Object.entries(parsed)) {
                            if (!Array.isArray(utxos)) {
                                hasValidStructure = false;
                                break;
                            }
                        }
                        
                        if (!hasValidStructure) {
                            console.log(`[MIGRATION 001] Removing invalid UTXO structure: ${key}`);
                            localStorage.removeItem(key);
                        }
                    }
                }
            } catch (error) {
                console.log(`[MIGRATION 001] Removing corrupted UTXO data: ${key}`);
                localStorage.removeItem(key);
            }
        }
    }
};

export default migration;
