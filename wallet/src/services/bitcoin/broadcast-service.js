'use client';

import config from '@/config';
import { quickNodeService } from './quicknode-service.js';

/**
 * Dedicated Bitcoin Broadcast Service
 * Handles transaction broadcasting to mempool.space
 */
export class BitcoinBroadcastService {
    constructor() {
        this.maxRetries = 2;
    }

    /**
     * Broadcast transaction using QuickNode (preferred) or mempool.space (fallback)
     */
    async broadcastTransaction(txHex) {
        try {
            // Try QuickNode first if available (more reliable for testnet4)
            if (quickNodeService.isAvailable()) {
                console.log(`[BitcoinBroadcastService] Broadcasting via QuickNode...`);
                console.log(`[BitcoinBroadcastService] Transaction hex length: ${txHex.length}`);
                
                try {
                    const txid = await quickNodeService.broadcastTransaction(txHex);
                    console.log(`[BitcoinBroadcastService] QuickNode broadcast successful: ${txid}`);
                    return {
                        success: true,
                        txid: txid.trim()
                    };
                } catch (quickNodeError) {
                    console.warn('[BitcoinBroadcastService] QuickNode broadcast failed, trying mempool.space fallback:', quickNodeError);
                }
            }

            // Fallback to mempool.space
            const apiUrl = config.bitcoin.getMempoolApiUrl();
            if (!apiUrl) {
                throw new Error('No broadcast API available for current network');
            }

            const broadcastUrl = `${apiUrl}/tx`;
            console.log(`[BitcoinBroadcastService] Broadcasting to mempool.space: ${broadcastUrl}`);
            console.log(`[BitcoinBroadcastService] Transaction hex length: ${txHex.length}`);

            const response = await fetch(broadcastUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain',
                },
                body: txHex,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
            }

            const txid = await response.text();
            console.log(`[BitcoinBroadcastService] Mempool.space broadcast successful: ${txid}`);
            return {
                success: true,
                txid: txid.trim()
            };

        } catch (error) {
            console.error('[BitcoinBroadcastService] Broadcast failed:', error);
            throw error;
        }
    }

    /**
     * Broadcast with retry logic for spent UTXOs
     */
    async broadcastWithRetry(txHex, selectedUtxos, transactionData, utxoUpdateCallback = null) {
        console.log('[BitcoinBroadcastService] Broadcasting with retry logic...');
        
        // Log UTXOs being spent
        console.log('[BitcoinBroadcastService] UTXOs being spent:');
        for (const utxo of selectedUtxos) {
            console.log(`  - ${utxo.txid}:${utxo.vout} (${utxo.value} sats) from ${utxo.address}`);
        }

        try {
            // First attempt
            const result = await this.broadcastTransaction(txHex);
            console.log('[BitcoinBroadcastService] ✅ Broadcast successful on first attempt');
            
            // Mark UTXOs as pending to prevent reuse
            if (utxoUpdateCallback) {
                try {
                    await utxoUpdateCallback(selectedUtxos, {});
                } catch (error) {
                    console.warn('[BitcoinBroadcastService] Failed to update UTXO state:', error);
                }
            }

            return result;

        } catch (error) {
            console.log('[BitcoinBroadcastService] First broadcast failed:', error.message);

            // Check if it's a spent UTXO error
            if (error.message.includes('bad-txns-inputs-missingorspent')) {
                console.log('[BitcoinBroadcastService] Detected spent UTXO error - cleaning up storage');
                
                // Track spent UTXOs to prevent reuse
                this.markUtxosAsSpent(selectedUtxos);
                
                // Remove spent UTXOs from storage
                if (utxoUpdateCallback) {
                    try {
                        await utxoUpdateCallback(selectedUtxos, {});
                        console.log('[BitcoinBroadcastService] Removed spent UTXOs from storage');
                    } catch (updateError) {
                        console.warn('[BitcoinBroadcastService] Failed to remove spent UTXOs:', updateError);
                    }
                }
                
                // Re-throw the error for handling upstream
                throw new Error('UTXOs were spent. Please refresh your wallet and try again.');
            }

            // For other errors, just re-throw
            throw error;
        }
    }

    /**
     * Mark UTXOs as spent to prevent reuse
     */
    markUtxosAsSpent(utxos) {
        try {
            const spentKey = 'bitcoin_spent_utxos';
            const existing = JSON.parse(localStorage.getItem(spentKey) || '{}');
            
            for (const utxo of utxos) {
                const utxoId = `${utxo.txid}:${utxo.vout}`;
                existing[utxoId] = {
                    txid: utxo.txid,
                    vout: utxo.vout,
                    timestamp: Date.now()
                };
            }
            
            localStorage.setItem(spentKey, JSON.stringify(existing));
            console.log(`[BitcoinBroadcastService] Marked ${utxos.length} UTXOs as spent`);
        } catch (error) {
            console.warn('[BitcoinBroadcastService] Failed to mark UTXOs as spent:', error);
        }
    }

    /**
     * Check if a UTXO is marked as spent
     */
    static isUtxoSpent(txid, vout) {
        try {
            const spentKey = 'bitcoin_spent_utxos';
            const spent = JSON.parse(localStorage.getItem(spentKey) || '{}');
            return !!spent[`${txid}:${vout}`];
        } catch (error) {
            return false;
        }
    }
}

export const bitcoinBroadcastService = new BitcoinBroadcastService();
export default BitcoinBroadcastService;
