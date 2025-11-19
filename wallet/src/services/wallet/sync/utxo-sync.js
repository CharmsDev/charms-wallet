/**
 * UTXO Synchronization Module
 * Handles UTXO fetching, validation, and storage
 */

import { utxoService } from '@/services/utxo';
import { refreshSpecificAddresses } from '@/services/utxo/address-refresh-helper';
import { getUTXOs, saveBalance } from '@/services/storage';

/**
 * Synchronize UTXOs for wallet addresses
 * 
 * @param {Object} options - Sync options
 * @param {Array} options.addresses - Specific addresses to sync (null = all)
 * @param {string} options.blockchain - Blockchain identifier
 * @param {string} options.network - Network identifier
 * @param {boolean} options.fullScan - Whether to do a full scan
 * @param {Function} options.onProgress - Progress callback
 * @param {Function} options.updateUTXOStore - UTXO store update function
 * @param {number} options.addressLimit - Limit number of addresses to scan
 * @returns {Object} Sync results with UTXOs and balance
 */
export async function syncUTXOs({ 
    addresses = null, 
    blockchain, 
    network, 
    fullScan = false,
    onProgress = null,
    updateUTXOStore = null,
    addressLimit = null
}) {
    const result = {
        utxosUpdated: 0,
        totalBalance: 0,
        success: false
    };

    try {
        let updatedUTXOs = {};

        // Full scan mode
        if (fullScan) {
            if (updateUTXOStore) {
                await updateUTXOStore(blockchain, network, addressLimit);
                updatedUTXOs = await getUTXOs(blockchain, network) || {};
            } else {
                await utxoService.fetchAndStoreAllUTXOsSequential(
                    blockchain,
                    network,
                    onProgress,
                    addressLimit,
                    0
                );
                updatedUTXOs = await getUTXOs(blockchain, network) || {};
            }
        } 
        // Specific addresses mode
        else if (addresses && addresses.length > 0) {
            updatedUTXOs = await refreshSpecificAddresses(addresses, blockchain, network);
            
            if (onProgress) {
                onProgress({
                    processed: addresses.length,
                    total: addresses.length,
                    isRefreshing: false
                });
            }
        } 
        // Load existing UTXOs
        else {
            updatedUTXOs = await getUTXOs(blockchain, network) || {};
        }

        result.utxosUpdated = Object.values(updatedUTXOs).reduce(
            (sum, utxoList) => sum + utxoList.length, 0
        );
        // Don't calculate balance here - will be calculated with proper filtering in main sync
        result.totalBalance = 0;
        result.success = true;
        
        return { result, utxos: updatedUTXOs };
    } catch (error) {
        console.error('[UTXOSync] Error:', error);
        result.error = error.message;
        return { result, utxos: {} };
    }
}
