'use client';

import config from '@/config';

/**
 * Mempool.space API Service
 * Handles direct API calls to mempool.space with proper error handling
 */
export class MempoolService {
    constructor() {
        this.timeout = 10000; // 10 seconds timeout
        this.txHexCache = new Map(); // key: `${network}:${txid}` -> { value, expiry }
        this.txCacheTTL = 60 * 1000; // 60s TTL for tx hex
        this.inflight = new Map(); // key -> Promise
        this.retryDelays = [300, 700, 1500]; // backoff for 429/5xx
    }

    // Create a timeout signal compatible with mobile browsers that may not support AbortSignal.timeout
    _createTimeoutSignal(ms) {
        try {
            if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
                return AbortSignal.timeout(ms);
            }
        } catch (_) {}
        const controller = new AbortController();
        setTimeout(() => {
            try { controller.abort(); } catch (_) {}
        }, ms);
        return controller.signal;
    }

    /**
     * Check if mempool.space is available (always true)
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
     * Make HTTP request to mempool.space API with retry logic
     */
    async _makeHttpRequest(url, options = {}) {
        const attempt = async () => {
            const response = await fetch(url, {
                ...options,
                signal: this._createTimeoutSignal(this.timeout),
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
                throw error;
            }
        }
        throw lastError || new Error('API request failed');
    }

    /**
     * Get UTXO information for an address
     */
    async getAddressUTXOs(address, network = null) {
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
        
        return { utxos, currentBlockHeight };
    }

    /**
     * Check if a specific UTXO is spent
     */
    async isUtxoSpent(txid, vout, network = null) {
        const baseUrl = this._getMempoolUrl(network);
        const url = `${baseUrl}/tx/${txid}/outspend/${vout}`;
        
        const result = await this._makeHttpRequest(url);
        return result.spent === true;
    }

    /**
     * Broadcast a transaction
     */
    async broadcastTransaction(txHex, network = null) {
        const baseUrl = this._getMempoolUrl(network);
        const url = `${baseUrl}/tx`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
            },
            body: txHex,
            signal: this._createTimeoutSignal(this.timeout),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Broadcast failed: ${response.status} - ${errorText}`);
        }

        return await response.text();
    }

    /**
     * Get transaction details
     */
    async getTransaction(txid, network = null) {
        const baseUrl = this._getMempoolUrl(network);
        const url = `${baseUrl}/tx/${txid}`;
        
        const tx = await this._makeHttpRequest(url);

        // Get current block height for confirmations calculation
        let currentBlockHeight = null;
        if (tx.status?.confirmed && tx.status?.block_height) {
            try {
                const tipUrl = `${baseUrl}/blocks/tip/height`;
                currentBlockHeight = await this._makeHttpRequest(tipUrl);
            } catch (error) {
                // Fallback: at least 1 if confirmed
            }
        }
        
        return { tx, currentBlockHeight };
    }

    /**
     * Get raw transaction hex
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
                signal: this._createTimeoutSignal(this.timeout),
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
     * Get address transaction history
     */
    async getAddressTransactions(address, network = null) {
        const baseUrl = this._getMempoolUrl(network);
        const url = `${baseUrl}/address/${address}/txs`;
        return await this._makeHttpRequest(url);
    }
}

export const mempoolService = new MempoolService();
export default mempoolService;
