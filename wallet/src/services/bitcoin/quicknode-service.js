'use client';

import config from '@/config';

/**
 * QuickNode Bitcoin API Service
 * More reliable alternative to mempool.space for testnet4
 */
export class QuickNodeService {
    constructor() {
        this.timeout = 10000; // 10 seconds timeout
    }

    /**
     * Check if QuickNode is available and configured
     */
    isAvailable() {
        return config.bitcoin.hasQuickNode();
    }

    /**
     * Make authenticated request to QuickNode
     */
    async makeRequest(method, params = []) {
        if (!this.isAvailable()) {
            throw new Error('QuickNode not configured');
        }

        const url = config.bitcoin.getQuickNodeApiUrl();
        const payload = {
            jsonrpc: '2.0',
            id: Date.now(),
            method,
            params
        };

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
     * Get UTXO information for an address
     */
    async getAddressUTXOs(address) {
        try {
            // Use listunspent RPC method to get UTXOs for address
            const utxos = await this.makeRequest('listunspent', [0, 9999999, [address]]);
            
            // Convert QuickNode format to our standard format
            return utxos.map(utxo => ({
                txid: utxo.txid,
                vout: utxo.vout,
                value: Math.round(utxo.amount * 100000000), // Convert BTC to satoshis
                address: utxo.address,
                scriptPubKey: utxo.scriptPubKey,
                confirmations: utxo.confirmations
            }));
        } catch (error) {
            console.error(`[QuickNodeService] Failed to get UTXOs for ${address}:`, error);
            return [];
        }
    }

    /**
     * Check if a specific UTXO is spent using gettxout
     * Returns true if spent/non-existent, false if unspent
     */
    async isUtxoSpent(txid, vout) {
        try {
            const result = await this.makeRequest('gettxout', [txid, vout, true]);
            
            // null => gastado (o no existe)
            // objeto => sigue unspent
            return result === null;
        } catch (error) {
            console.warn(`[QuickNodeService] Failed to check UTXO ${txid}:${vout}:`, error);
            return false; // Assume unspent if check fails
        }
    }

    /**
     * Broadcast a transaction
     */
    async broadcastTransaction(txHex) {
        try {
            const txid = await this.makeRequest('sendrawtransaction', [txHex]);
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
    async getTransaction(txid) {
        try {
            return await this.makeRequest('getrawtransaction', [txid, true]);
        } catch (error) {
            console.error(`[QuickNodeService] Failed to get transaction ${txid}:`, error);
            throw error;
        }
    }

    /**
     * Verify multiple UTXOs in batch
     */
    async verifyUtxos(utxos) {
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
