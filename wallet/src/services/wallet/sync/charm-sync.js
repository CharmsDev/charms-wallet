/**
 * Charm Synchronization Module
 * Handles charm detection, validation, and storage
 */

import { charmsService } from '@/services/charms/charms';
import { getCharms, saveCharms } from '@/services/storage';
import { scanCharmTransactions } from './transaction-scanner';

/**
 * Synchronize charms for given UTXOs
 * 
 * @param {Object} options - Sync options
 * @param {Object} options.utxos - UTXO map to scan
 * @param {string} options.blockchain - Blockchain identifier
 * @param {string} options.network - Network identifier
 * @param {Function} options.onProgress - Progress callback
 * @param {Function} options.onCharmFound - Charm found callback
 * @returns {Object} Sync results
 */
export async function syncCharms({ utxos, blockchain, network, onProgress, onCharmFound }) {
    const result = {
        charmsFound: 0,
        charmsRemoved: 0,
        success: false,
        error: null
    };

    try {
        // Get scanned addresses and existing charms
        const scannedAddresses = Object.keys(utxos);
        const existingCharms = await getCharms(blockchain, network) || [];
        
        // Create UTXO existence map for validation
        const utxoExists = new Map();
        Object.entries(utxos).forEach(([address, utxoList]) => {
            utxoList.forEach(utxo => {
                const key = `${address}:${utxo.txid}:${utxo.vout}`;
                utxoExists.set(key, true);
            });
        });
        
        // Keep charms from non-scanned addresses + valid charms from scanned addresses
        const charmsToKeep = existingCharms.filter(charm => {
            // Keep charms from addresses we didn't scan
            if (!scannedAddresses.includes(charm.address)) {
                return true;
            }
            
            // For scanned addresses: only keep if UTXO still exists
            const key = `${charm.address}:${charm.txid}:${charm.outputIndex}`;
            return utxoExists.has(key);
        });
        
        result.charmsRemoved = existingCharms.length - charmsToKeep.length;
        
        // Create map of existing charms for deduplication
        const existingCharmKeys = new Set(
            charmsToKeep.map(c => `${c.txid}:${c.outputIndex}`)
        );
        
        // Scan and add NEW charms
        const newCharms = [];
        await charmsService.getCharmsByUTXOsProgressive(
            utxos,
            network,
            async (charm) => {
                const key = `${charm.txid}:${charm.outputIndex}`;
                if (!existingCharmKeys.has(key)) {
                    newCharms.push(charm);
                    result.charmsFound++;
                }
            },
            onProgress
        );
        
        // Combine and enhance charms
        const finalCharms = [...charmsToKeep, ...newCharms];
        
        // Process charms with reference data
        const { default: charmsExplorerAPI } = await import('@/services/charms/charms-explorer-api');
        const enhancedCharms = await charmsExplorerAPI.processCharmsWithReferenceData(finalCharms);
        
        // Save to localStorage
        await saveCharms(enhancedCharms, blockchain, network);
        
        // Update Zustand store
        const { useCharmsStore } = await import('@/stores/charms');
        useCharmsStore.setState({ 
            charms: enhancedCharms, 
            initialized: true,
            isLoading: false,
            currentNetwork: `${blockchain}-${network}`
        });
        
        // Scan for historical charm transactions
        await scanCharmTransactions(enhancedCharms, blockchain, network);
        
        result.success = true;
        return result;
    } catch (error) {
        console.error('[CharmSync] Error:', error);
        result.error = error.message;
        return result;
    }
}
