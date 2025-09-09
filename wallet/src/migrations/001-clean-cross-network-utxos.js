/**
 * Migration 001: Normalize UTXO storage by network
 *
 * Ensures UTXO entries in localStorage are aligned with the expected
 * address prefix for each network and removes invalid or malformed entries.
 */

import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';

const migration = {
    id: '001-clean-cross-network-utxos',
    description: 'Normalize UTXO storage per network and clean invalid entries',
    version: '1.0.0',
    
    async execute() {
        console.log('[MIGRATION 001] Starting UTXO normalization...');
        
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
                
                // Keep only addresses that match the expected network prefix
                Object.entries(utxos).forEach(([address, addressUtxos]) => {
                    if (address.startsWith(prefix)) {
                        cleanedUtxos[address] = addressUtxos;
                    } else {
                        console.log(`[MIGRATION 001] Removing address not matching prefix for ${network}: ${address}`);
                        removedCount++;
                    }
                });
                
                if (removedCount > 0) {
                    // Persist normalized UTXO map
                    localStorage.setItem(storageKey, JSON.stringify(cleanedUtxos));
                    console.log(`[MIGRATION 001] Cleaned ${removedCount} addresses for ${network}`);
                    totalCleaned += removedCount;
                } else {
                    console.log(`[MIGRATION 001] No cleanup required for ${network}`);
                }
                
            } catch (error) {
                console.error(`[MIGRATION 001] Error processing ${storageKey}:`, error);
            }
        }
        
        console.log(`[MIGRATION 001] Normalization completed. Total addresses cleaned: ${totalCleaned}`);
        
        // Validate and remove orphaned or invalid UTXO keys
        await this.cleanOrphanedUtxoKeys();
    },
    
    async cleanOrphanedUtxoKeys() {
        console.log('[MIGRATION 001] Validating UTXO storage keys...');
        
        const utxoKeyPattern = /^(bitcoin|cardano)_(mainnet|testnet|regtest)_wallet_utxos$/;
        const keysToCheck = [];
        
        // Scan localStorage for UTXO-related keys
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && utxoKeyPattern.test(key)) {
                keysToCheck.push(key);
            }
        }
        
        console.log(`[MIGRATION 001] Found ${keysToCheck.length} UTXO-related keys`);
        
        for (const key of keysToCheck) {
            try {
                const data = localStorage.getItem(key);
                if (data) {
                    const parsed = JSON.parse(data);
                    
                    // Basic structure check: { address: UTXO[] }
                    if (typeof parsed === 'object' && parsed !== null) {
                        let hasValidStructure = true;
                        
                        // Validate that values are arrays
                        for (const [address, utxos] of Object.entries(parsed)) {
                            if (!Array.isArray(utxos)) {
                                hasValidStructure = false;
                                break;
                            }
                        }
                        
                        if (!hasValidStructure) {
                            console.log(`[MIGRATION 001] Removing invalid UTXO structure at key: ${key}`);
                            localStorage.removeItem(key);
                        }
                    }
                }
            } catch (error) {
                console.log(`[MIGRATION 001] Removing unparsable UTXO data at key: ${key}`);
                localStorage.removeItem(key);
            }
        }
    }
};

export default migration;
