'use client';

import config from '@/config';
import { quickNodeService } from './quicknode-service.js';

/**
 * Simple UTXO Cleaner Service
 * Verifies and removes spent UTXOs from localStorage
 */
export class UTXOCleaner {
    constructor() {
        this.timeout = 3000; // 3 seconds timeout
    }

    /**
     * Get API URL for current network
     */
    getApiUrl() {
        const network = config.network;
        if (network === 'testnet' || network === 'testnet4') {
            return 'https://mempool.space/testnet4/api';
        }
        return 'https://mempool.space/api';
    }

    /**
     * Check if UTXO is spent using QuickNode (preferred) or mempool.space (fallback)
     */
    async isUtxoSpent(txid, vout) {
        try {
            // Try QuickNode first if available (more reliable)
            if (quickNodeService.isAvailable()) {
                return await quickNodeService.isUtxoSpent(txid, vout);
            }

            // Fallback to mempool.space API
            const apiUrl = this.getApiUrl();
            const response = await fetch(`${apiUrl}/tx/${txid}/outspend/${vout}`, {
                method: 'GET',
                signal: AbortSignal.timeout(this.timeout)
            });

            if (!response.ok) {
                console.warn(`[UTXOCleaner] API error for ${txid}:${vout}: ${response.status}`);
                return false; // Assume unspent if API fails
            }

            const data = await response.json();
            return data.spent === true;

        } catch (error) {
            console.warn(`[UTXOCleaner] Failed to check ${txid}:${vout}:`, error.message);
            return false; // Assume unspent if check fails
        }
    }

    /**
     * Clean spent UTXOs from a list
     */
    async cleanUtxos(utxos) {
        console.log(`[UTXOCleaner] Checking ${utxos.length} UTXOs...`);
        
        const results = await Promise.allSettled(
            utxos.map(async (utxo) => {
                const isSpent = await this.isUtxoSpent(utxo.txid, utxo.vout);
                return { utxo, isSpent };
            })
        );

        const validUtxos = [];
        const spentUtxos = [];

        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                if (result.value.isSpent) {
                    spentUtxos.push(result.value.utxo);
                    console.log(`[UTXOCleaner] SPENT: ${result.value.utxo.txid}:${result.value.utxo.vout}`);
                } else {
                    validUtxos.push(result.value.utxo);
                }
            } else {
                // If check failed, keep UTXO to avoid blocking transactions
                validUtxos.push(utxos[index]);
            }
        });

        // Remove spent UTXOs from localStorage
        if (spentUtxos.length > 0) {
            await this.removeSpentFromStorage(spentUtxos);
        }

        console.log(`[UTXOCleaner] Results: ${validUtxos.length} valid, ${spentUtxos.length} spent (removed)`);
        
        return {
            validUtxos,
            spentUtxos,
            removedCount: spentUtxos.length
        };
    }

    /**
     * Remove spent UTXOs from localStorage
     */
    async removeSpentFromStorage(spentUtxos) {
        try {
            const { utxoService } = await import('@/services/utxo');
            
            for (const utxo of spentUtxos) {
                await utxoService.removeUtxo(utxo.txid, utxo.vout);
                console.log(`[UTXOCleaner] Removed from storage: ${utxo.txid}:${utxo.vout}`);
            }
        } catch (error) {
            console.error('[UTXOCleaner] Failed to remove from storage:', error);
        }
    }
}

export default UTXOCleaner;
