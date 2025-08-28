'use client';

import config from '@/config';

/**
 * QuickNode Bitcoin API Service
 * Centralized interface for all QuickNode API interactions
 */
export class QuickNodeService {
    constructor() {
        this.timeout = 10000; // 10 seconds timeout
    }

    /**
     * Check if QuickNode is available and configured for specific network
     */
    isAvailable(network) {
        return config.bitcoin.hasQuickNode(network);
    }

    /**
     * Make authenticated request to QuickNode
     */
    async makeRequest(method, params = [], network = null) {
        if (!this.isAvailable(network)) {
            throw new Error(`QuickNode not configured for network: ${network || 'current'}`);
        }

        const url = config.bitcoin.getQuickNodeApiUrl(network);
        if (!url) {
            throw new Error(`QuickNode URL not available for network: ${network || config.bitcoin.network}`);
        }

        const payload = {
            jsonrpc: '2.0',
            id: Date.now(),
            method,
            params
        };

        console.log(`[QuickNodeService] Making request to: ${url}`);
        console.log(`[QuickNodeService] Target network: ${network || config.bitcoin.network}`);
        console.log(`[QuickNodeService] Method: ${method}, Params:`, params);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(this.timeout)
            });

            if (!response.ok) {
                throw new Error(`QuickNode API error: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.error) {
                throw new Error(`QuickNode RPC error: ${data.error.message}`);
            }

            return data.result;
        } catch (error) {
            console.error('[QuickNodeService] Request failed:', error);
            throw error;
        }
    }

    /**
     * Get UTXO information for an address using Blockbook RPC
     */
    async getAddressUTXOs(address, network = null) {
        // Use bb_getUTXOs with Blockbook RPC (includes mempool + confirmed)
        const utxos = await this.makeRequest('bb_getUTXOs', [address, { confirmed: false }], network);
        
        // Convert QuickNode Blockbook format to our standard format
        return utxos.map(utxo => ({
            txid: utxo.txid,
            vout: utxo.vout,
            value: parseInt(utxo.value, 10), // Convert string to number (satoshis)
            address: address,
            confirmations: utxo.confirmations ?? 0,
            blockHeight: utxo.height,
            coinbase: utxo.coinbase || false,
            status: {
                confirmed: (utxo.confirmations ?? 0) > 0,
                block_height: utxo.height || null,
                block_hash: null,
                block_time: null
            }
        }));
    }

    /**
     * Check if a specific UTXO is spent using gettxout
     * Returns true if spent/non-existent, false if unspent
     */
    async isUtxoSpent(txid, vout, network = null) {
        try {
            const result = await this.makeRequest('gettxout', [txid, vout, true], network);
            
            // null => spent (or doesn't exist)
            // object => still unspent
            return result === null;
        } catch (error) {
            console.warn(`[QuickNodeService] Failed to check UTXO ${txid}:${vout}:`, error);
            return false; // Assume unspent if check fails
        }
    }

    /**
     * Broadcast a transaction
     */
    async broadcastTransaction(txHex, network = null) {
        try {
            const txid = await this.makeRequest('sendrawtransaction', [txHex], network);
            console.log(`[QuickNodeService] Transaction broadcast successful: ${txid}`);
            return txid;
        } catch (error) {
            console.error('[QuickNodeService] Broadcast failed:', error);
            throw error;
        }
    }

    /**
     * Get transaction details
     */
    async getTransaction(txid, network = null) {
        try {
            return await this.makeRequest('getrawtransaction', [txid, true], network);
        } catch (error) {
            console.error(`[QuickNodeService] Failed to get transaction ${txid}:`, error);
            throw error;
        }
    }

    /**
     * Get raw transaction hex
     */
    async getTransactionHex(txid, network = null) {
        try {
            return await this.makeRequest('getrawtransaction', [txid, false], network);
        } catch (error) {
            console.error(`[QuickNodeService] Failed to get transaction hex ${txid}:`, error);
            throw error;
        }
    }

    /**
     * Verify multiple UTXOs in batch
     */
    async verifyUtxos(utxos, network = null) {
        const results = await Promise.allSettled(
            utxos.map(async (utxo) => {
                const isSpent = await this.isUtxoSpent(utxo.txid, utxo.vout, network);
                return { utxo, isSpent };
            })
        );

        const validUtxos = [];
        const spentUtxos = [];

        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                if (result.value.isSpent) {
                    spentUtxos.push(result.value.utxo);
                    console.log(`[QuickNodeService] SPENT: ${result.value.utxo.txid}:${result.value.utxo.vout}`);
                } else {
                    validUtxos.push(result.value.utxo);
                }
            } else {
                // If check failed, keep UTXO to avoid blocking transactions
                validUtxos.push(utxos[index]);
            }
        });

        console.log(`[QuickNodeService] Verified ${utxos.length} UTXOs: ${validUtxos.length} valid, ${spentUtxos.length} spent`);
        
        return {
            validUtxos,
            spentUtxos,
            removedCount: spentUtxos.length
        };
    }
}

export const quickNodeService = new QuickNodeService();
export default quickNodeService;
