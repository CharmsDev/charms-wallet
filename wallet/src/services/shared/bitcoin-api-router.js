'use client';

import config from '@/config';

/**
 * Bitcoin API Router - Unified interface for Bitcoin API calls
 * Routes to mempool.space with same interface as QuickNode service
 */
export class BitcoinApiRouter {
    constructor() {
        this.timeout = 10000; // 10 seconds timeout
        this.txHexCache = new Map(); // key: `${network}:${txid}` -> { value, expiry }
        this.txCacheTTL = 60 * 1000; // 60s TTL for tx hex
        this.inflight = new Map(); // key -> Promise
        this.retryDelays = [300, 700, 1500]; // backoff for 429/5xx
    }

    /**
     * Check if API is available (always true for mempool.space)
     */
    isAvailable(network) {
        return true; // mempool.space is always available
    }

    /**
     * Get mempool.space API URL for network
     */
    _getMempoolUrl(network) {
        const targetNetwork = network || config.bitcoin.network;
        if (targetNetwork === 'mainnet') {
            return 'https://mempool.space/api';
        } else if (targetNetwork === 'testnet' || targetNetwork === 'testnet4') {
            return 'https://mempool.space/testnet4/api';
        }
        throw new Error(`Unsupported network: ${targetNetwork}`);
    }

    /**
     * Make HTTP request to mempool.space API
     */
    async _makeHttpRequest(url, options = {}) {
        const attempt = async () => {
            const response = await fetch(url, {
                ...options,
                signal: AbortSignal.timeout(this.timeout),
            });

            if (!response.ok) {
                // 429/5xx -> allow retry
                if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
                    const err = new Error(`Mempool API retryable error: ${response.status}`);
                    err.status = response.status;
                    throw err;
                }
                throw new Error(`Mempool API error: ${response.status}`);
            }

            return response.json();
        };

        let lastError = null;
        for (let i = 0; i <= this.retryDelays.length; i++) {
            try {
                return await attempt();
            } catch (error) {
                lastError = error;
                const isRetryable = error && (error.status === 429 || (error.status >= 500 && error.status < 600));
                if (i < this.retryDelays.length && isRetryable) {
                    await new Promise(res => setTimeout(res, this.retryDelays[i]));
                    continue;
                }
                console.error(`[BitcoinApiRouter] HTTP request failed:`, error);
                throw error;
            }
        }
        throw lastError || new Error('API request failed');
    }

    /**
     * Get UTXO information for an address using mempool.space
     * Maintains same interface as QuickNode service
     */
    async getAddressUTXOs(address, network = null) {
        try {
            const baseUrl = this._getMempoolUrl(network);
            const url = `${baseUrl}/address/${address}/utxo`;
            
            const utxos = await this._makeHttpRequest(url);
            if (!utxos || utxos.length === 0) {
                return [];
            }

            // Get current block height for confirmations calculation
            let currentBlockHeight = null;
            try {
                const tipUrl = `${baseUrl}/blocks/tip/height`;
                currentBlockHeight = await this._makeHttpRequest(tipUrl);
            } catch (error) {
                // If we can't get current height, use confirmed status only
            }
            
            // Convert mempool.space format to QuickNode-compatible format
            return utxos.map(utxo => {
                let confirmations = 0;
                if (utxo.status?.confirmed && utxo.status?.block_height) {
                    if (currentBlockHeight !== null) {
                        confirmations = Math.max(0, currentBlockHeight - utxo.status.block_height + 1);
                    } else {
                        confirmations = 1; // Fallback: at least 1 if confirmed
                    }
                }

                return {
                    txid: utxo.txid,
                    vout: utxo.vout,
                    value: utxo.value, // Already in satoshis
                    address: address,
                    confirmations: confirmations,
                    blockHeight: utxo.status?.block_height || null,
                    coinbase: false, // mempool.space doesn't provide this info
                    status: {
                        confirmed: utxo.status?.confirmed || false,
                        block_height: utxo.status?.block_height || null,
                        block_hash: utxo.status?.block_hash || null,
                        block_time: utxo.status?.block_time || null
                    }
                };
            });
        } catch (error) {
            console.error(`[BitcoinApiRouter] Error getting UTXOs for ${address}:`, error);
            throw error;
        }
    }

    /**
     * Check if a specific UTXO is spent using mempool.space
     * Returns true if spent/non-existent, false if unspent
     */
    async isUtxoSpent(txid, vout, network = null) {
        try {
            const baseUrl = this._getMempoolUrl(network);
            const url = `${baseUrl}/tx/${txid}/outspend/${vout}`;
            
            const result = await this._makeHttpRequest(url);
            
            // mempool.space returns { spent: true/false, txid?: string, vin?: number }
            return result.spent === true;
        } catch (error) {
            // If we can't check, assume unspent to avoid blocking transactions
            return false;
        }
    }

    /**
     * Broadcast a transaction using mempool.space
     */
    async broadcastTransaction(txHex, network = null) {
        try {
            const baseUrl = this._getMempoolUrl(network);
            const url = `${baseUrl}/tx`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain',
                },
                body: txHex,
                signal: AbortSignal.timeout(this.timeout),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Broadcast failed: ${response.status} - ${errorText}`);
            }

            // mempool.space returns the txid as plain text
            return await response.text();
        } catch (error) {
            console.error(`[BitcoinApiRouter] Broadcast error:`, error);
            throw error;
        }
    }

    /**
     * Get transaction details using mempool.space
     */
    async getTransaction(txid, network = null) {
        try {
            const baseUrl = this._getMempoolUrl(network);
            const url = `${baseUrl}/tx/${txid}`;
            
            const tx = await this._makeHttpRequest(url);

            // Calculate confirmations properly
            let confirmations = 0;
            if (tx.status?.confirmed && tx.status?.block_height) {
                try {
                    const tipUrl = `${baseUrl}/blocks/tip/height`;
                    const currentBlockHeight = await this._makeHttpRequest(tipUrl);
                    confirmations = Math.max(0, currentBlockHeight - tx.status.block_height + 1);
                } catch (error) {
                    confirmations = 1; // Fallback: at least 1 if confirmed
                }
            }
            
            // Convert mempool.space format to QuickNode-compatible format
            return {
                txid: tx.txid,
                hash: tx.txid,
                version: tx.version,
                size: tx.size,
                vsize: tx.vsize,
                weight: tx.weight,
                locktime: tx.locktime,
                vin: tx.vin,
                vout: tx.vout,
                hex: null, // Will be fetched separately if needed
                blockhash: tx.status?.block_hash || null,
                confirmations: confirmations,
                time: tx.status?.block_time || null,
                blocktime: tx.status?.block_time || null,
                fee: tx.fee || 0
            };
        } catch (error) {
            console.error(`[BitcoinApiRouter] Error getting transaction ${txid}:`, error);
            throw error;
        }
    }

    /**
     * Get raw transaction hex using mempool.space
     */
    async getTransactionHex(txid, network = null) {
        const targetNetwork = network || config.bitcoin.network;
        const key = `${targetNetwork}:${txid}`;
        const now = Date.now();

        // Serve from cache if fresh
        const cached = this.txHexCache.get(key);
        if (cached && cached.expiry > now) {
            return cached.value;
        }

        // Deduplicate inflight
        if (this.inflight.has(key)) {
            return this.inflight.get(key);
        }

        const p = (async () => {
            const baseUrl = this._getMempoolUrl(targetNetwork);
            const url = `${baseUrl}/tx/${txid}/hex`;
            
            const response = await fetch(url, {
                signal: AbortSignal.timeout(this.timeout),
            });

            if (!response.ok) {
                throw new Error(`Failed to get transaction hex: ${response.status}`);
            }

            const result = await response.text();
            // Cache result
            this.txHexCache.set(key, { value: result, expiry: now + this.txCacheTTL });
            return result;
        })()
            .finally(() => {
                // Clear inflight after completion
                this.inflight.delete(key);
            });

        this.inflight.set(key, p);
        return p;
    }

    /**
     * Verify multiple UTXOs in batch
     * Maintains same interface as QuickNode service
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

    /**
     * Legacy compatibility method - same as makeRequest but for mempool.space
     * This maintains compatibility with any code expecting RPC-style calls
     */
    async makeRequest(method, params = [], network = null) {
        // Map common RPC methods to mempool.space API calls
        switch (method) {
            case 'bb_getutxos':
                if (params.length > 0) {
                    return this.getAddressUTXOs(params[0], network);
                }
                throw new Error('bb_getutxos requires address parameter');

            case 'bb_getaddress':
                if (params.length > 0) {
                    // Get address transaction history using mempool.space
                    const baseUrl = this._getMempoolUrl(network);
                    const url = `${baseUrl}/address/${params[0]}/txs`;
                    const txs = await this._makeHttpRequest(url);
                    
                    // Convert to QuickNode Blockbook format
                    return {
                        address: params[0],
                        txs: txs.map(tx => tx.txid), // Return array of txids
                        transactions: txs.map(tx => tx.txid), // Alternative format
                        txids: txs.map(tx => tx.txid) // Another alternative format
                    };
                }
                throw new Error('bb_getaddress requires address parameter');

            case 'bb_gettransaction':
                if (params.length > 0) {
                    // Get transaction details - same as getTransaction but ensure QuickNode format
                    return this.getTransaction(params[0], network);
                }
                throw new Error('bb_gettransaction requires txid parameter');
                
            case 'gettxout':
                if (params.length >= 2) {
                    const isSpent = await this.isUtxoSpent(params[0], params[1], network);
                    return isSpent ? null : { value: 0 }; // Simplified response
                }
                throw new Error('gettxout requires txid and vout parameters');
                
            case 'sendrawtransaction':
                if (params.length > 0) {
                    return this.broadcastTransaction(params[0], network);
                }
                throw new Error('sendrawtransaction requires hex parameter');
                
            case 'getrawtransaction':
                if (params.length > 0) {
                    const verbose = params[1] === true;
                    if (verbose) {
                        return this.getTransaction(params[0], network);
                    } else {
                        return this.getTransactionHex(params[0], network);
                    }
                }
                throw new Error('getrawtransaction requires txid parameter');
                
            default:
                throw new Error(`Unsupported RPC method: ${method}`);
        }
    }
}

export const bitcoinApiRouter = new BitcoinApiRouter();
export default bitcoinApiRouter;
