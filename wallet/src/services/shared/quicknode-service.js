'use client';

import config from '@/config';

/**
 * QuickNode Bitcoin API Service
 * Direct provider mode: browser calls QuickNode endpoints directly
 */
export class QuickNodeService {
    constructor() {
        this.timeout = 10000; // 10 seconds timeout
    }

    /**
     * Check if QuickNode direct configuration is available
     */
    isAvailable(network) {
        const url = config.bitcoin.getQuickNodeApiUrl(network);
        const key = config.bitcoin.getQuickNodeApiKey(network);
        return !!(url && url.trim() !== '' && key && key.trim() !== '');
    }


    /**
     * Make request directly to QuickNode (Basic Auth)
     */
    async makeRequest(method, params = [], network = null) {
        const targetNetwork = network || config.bitcoin.network;
        
        // Guard: ensure QuickNode is configured
        if (!this.isAvailable(targetNetwork)) {
            throw new Error(`QuickNode not configured`);
        }

        const url = config.bitcoin.getQuickNodeApiUrl(targetNetwork);
        const apiKey = config.bitcoin.getQuickNodeApiKey(targetNetwork);
        const payload = { jsonrpc: '2.0', id: Date.now(), method, params };
        
        try {
            const headers = { 'Content-Type': 'application/json' };
            // Use Basic Auth with API key as username and empty password
            try {
                const token = typeof btoa === 'function' ? btoa(`${apiKey}:`) : Buffer.from(`${apiKey}:`).toString('base64');
                headers['Authorization'] = `Basic ${token}`;
            } catch (_) {}

            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(this.timeout),
            });

            if (!response.ok) {
                throw new Error(`QuickNode error: ${response.status}`);
            }

            const data = await response.json();
            if (data && data.error) {
                const message = typeof data.error === 'string' ? data.error : (data.error.message || 'RPC error');
                throw new Error(`QuickNode RPC error: ${message}`);
            }
            return data?.result;
        } catch (error) {
            console.error(`[QuickNodeService] Direct call failed:`, error);
            throw error;
        }
    }

    /**
     * Get UTXO information for an address using QuickNode Blockbook add-on
     * NOTE: Using paid Blockbook add-on in QuickNode Pro account for bb_getutxos method
     */
    async getAddressUTXOs(address, network = null) {
        try {
            // Use bb_getutxos with QuickNode Blockbook add-on (paid feature)
            // This requires Blockbook add-on enabled in QuickNode Pro account
            const utxos = await this.makeRequest('bb_getutxos', [address], network);
            if (!utxos || utxos.length === 0) {
                return [];
            }
            
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
        } catch (error) {
            console.error(`[QuickNodeService] Error getting UTXOs for ${address}:`, error);
            throw error;
        }
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
            return false; // Assume unspent if check fails
        }
    }

    /**
     * Broadcast a transaction
     */
    async broadcastTransaction(txHex, network = null) {
        try {
            const txid = await this.makeRequest('sendrawtransaction', [txHex], network);
            return txid;
        } catch (error) {
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
                } else {
                    validUtxos.push(result.value.utxo);
                }
            } else {
                // If check failed, keep UTXO to avoid blocking transactions
                validUtxos.push(utxos[index]);
            }
        });
        
        return {
            validUtxos,
            spentUtxos,
            removedCount: spentUtxos.length
        };
    }
}

export const quickNodeService = new QuickNodeService();
export default quickNodeService;
