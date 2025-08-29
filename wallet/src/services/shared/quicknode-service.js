'use client';

import config from '@/config';

/**
 * QuickNode Bitcoin API Service
 * Centralized interface for all QuickNode API interactions
 */
export class QuickNodeService {
    constructor() {
        this.timeout = 10000; // 10 seconds timeout
        this._routeMode = 'auto'; // 'auto' | 'proxy' | 'direct'
        this._routeResolved = false;
    }

    /**
     * Check if QuickNode is available and configured for specific network
     */
    isAvailable(network) {
        const url = config.bitcoin.getQuickNodeApiUrl(network);
        return url !== null && url !== undefined && url.trim() !== '';
    }

    /**
     * Initialize routing mode once (call this on app start if you want eager resolution)
     */
    async initRouting(network = null) {
        await this.resolveRouteModeOnce(network);
        return this._routeMode;
    }

    /**
     * Decide once whether to use direct or proxy calls when mode is 'auto'.
     * We try a small direct JSON-RPC call (getblockcount). If CORS/network blocks, we fallback to 'proxy'.
     */
    async resolveRouteModeOnce(network = null) {
        if (this._routeResolved) return this._routeMode;

        // Respect explicit configuration
        // No env-based override; always auto-detect

        // Auto-detect: attempt a direct probe
        const url = config.bitcoin.getQuickNodeApiUrl(network || config.bitcoin.network);
        if (!url) {
            // No QuickNode config -> mark resolved but leave as 'proxy' to force server route if called
            this._routeMode = 'proxy';
            this._routeResolved = true;
            return this._routeMode;
        }

        const probePayload = {
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'getblockcount',
            params: [],
        };

        try {
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(probePayload),
                signal: AbortSignal.timeout(3000),
                mode: 'cors',
            });
            // If we got here without CORS/network exception, consider direct viable regardless of JSON body
            if (resp.ok) {
                this._routeMode = 'direct';
            } else {
                // Non-2xx still proves CORS not blocking; but prefer OK to be safe. If non-ok, fallback to proxy
                this._routeMode = 'proxy';
            }
        } catch (e) {
            // Any fetch/CORS failure => use proxy
            this._routeMode = 'proxy';
        }

        this._routeResolved = true;
        return this._routeMode;
    }

    /**
     * Make authenticated request to QuickNode
     */
    async makeRequest(method, params = [], network = null) {
        // Guard: ensure QuickNode is configured for the selected network
        if (!this.isAvailable(network)) {
            throw new Error(`QuickNode not configured for network: ${network || config.bitcoin.network}`);
        }

        // Ensure routing is resolved once
        await this.resolveRouteModeOnce(network);

        const targetNetwork = network || config.bitcoin.network;

        // Branch based on resolved mode
        if (this._routeMode === 'direct') {
            const url = config.bitcoin.getQuickNodeApiUrl(targetNetwork);
            const payload = { jsonrpc: '2.0', id: Date.now(), method, params };
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(this.timeout),
                    mode: 'cors',
                });

                if (!response.ok) {
                    throw new Error(`QuickNode API error: ${response.status}`);
                }

                const data = await response.json();
                if (data && data.error) {
                    const message = typeof data.error === 'string' ? data.error : (data.error.message || 'RPC error');
                    throw new Error(`QuickNode RPC error: ${message}`);
                }
                return data?.result;
            } catch (error) {
                // If direct fails unexpectedly (e.g., deployment env), fallback to proxy for this call and stick to proxy for future
                this._routeMode = 'proxy';
                this._routeResolved = true;
                // Continue to proxy path below
            }
        }

        // Proxy path (default/fallback)
        const proxyUrl = '/api/quicknode';
        const proxyPayload = { method, params, network: targetNetwork };
        try {
            const response = await fetch(proxyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(proxyPayload),
                signal: AbortSignal.timeout(this.timeout),
            });

            if (!response.ok) {
                throw new Error(`QuickNode proxy error: ${response.status}`);
            }

            const rpc = await response.json();
            if (rpc && rpc.error) {
                const message = typeof rpc.error === 'string' ? rpc.error : (rpc.error.message || 'RPC error');
                throw new Error(`QuickNode RPC error: ${message}`);
            }
            return rpc?.result;
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error('QuickNode proxy unavailable. Check network connection and API configuration.');
            }
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
