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
        this.retryDelays = [2000, 5000]; // backoff for 429/5xx (2 retries with longer waits)
        this.lastRequestTime = 0; // Track last request time
        this.minRequestInterval = 600; // Minimum 600ms between requests to avoid 429
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
     * Get block timestamp by block height — tries Explorer API first
     */
    async getBlockTimestamp(blockHeight, network) {
        // Primary: Explorer API
        try {
            const { explorerWalletService } = await import('./explorer-wallet-service');
            const targetNetwork = network || config.bitcoin.network;
            if (explorerWalletService.isAvailable(targetNetwork)) {
                const tip = await explorerWalletService.getTip(targetNetwork);
                if (tip?.timestamp) return tip.timestamp;
            }
        } catch (_) { /* fall through to mempool */ }

        // Fallback: mempool.space
        try {
            const baseUrl = this._getMempoolUrl(network);
            const hashUrl = `${baseUrl}/block-height/${blockHeight}`;
            await this._rateLimit();
            const hashResponse = await fetch(hashUrl, {
                signal: this._createTimeoutSignal(this.timeout),
            });
            if (!hashResponse.ok) throw new Error(`Failed to get block hash: ${hashResponse.status}`);
            const blockHash = await hashResponse.text();
            const blockUrl = `${baseUrl}/block/${blockHash}`;
            const block = await this._makeHttpRequest(blockUrl);
            return block.timestamp;
        } catch (error) {
            console.warn(`[Mempool] Failed to get block timestamp for height ${blockHeight}:`, error.message);
            return null;
        }
    }

    /**
     * Get mempool.space API URL for network
     */
    _getMempoolUrl(network) {
        const targetNetwork = network || config.bitcoin.network;
        if (targetNetwork === 'mainnet') {
            return 'https://mempool.space/api';
        } else if (targetNetwork === 'testnet4') {
            return 'https://mempool.space/testnet4/api';
        }
        throw new Error(`Unsupported network: ${targetNetwork}`);
    }

    /**
     * Rate limit requests to avoid 429 errors
     */
    async _rateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.minRequestInterval) {
            const delay = this.minRequestInterval - timeSinceLastRequest;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        this.lastRequestTime = Date.now();
    }

    /**
     * Make HTTP request to mempool.space API with retry logic
     */
    async _makeHttpRequest(url, options = {}) {
        const attempt = async () => {
            // Apply rate limiting
            await this._rateLimit();
            
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
     * Get UTXO information for an address — tries Explorer API first,
     * falls back to mempool.space.
     *
     * Always returns the same shape: `{ utxos: [...], currentBlockHeight: number|null }`.
     * Empty address → `{ utxos: [], currentBlockHeight: null }` (never bare array).
     */
    async getAddressUTXOs(address, network = null) {
        // Primary: Explorer API
        try {
            const { explorerWalletService } = await import('./explorer-wallet-service');
            const targetNetwork = network || config.bitcoin.network;
            if (explorerWalletService.isAvailable(targetNetwork)) {
                const utxos = await explorerWalletService.getAddressUTXOs(address, targetNetwork);
                if (utxos) return { utxos: utxos || [], currentBlockHeight: null };
            }
        } catch (_) { /* fall through to mempool */ }

        // Fallback: mempool.space
        const baseUrl = this._getMempoolUrl(network);
        try {
            const utxos = await this._makeHttpRequest(`${baseUrl}/address/${address}/utxo`);
            if (!utxos || utxos.length === 0) {
                return { utxos: [], currentBlockHeight: null };
            }
            let currentBlockHeight = null;
            try {
                currentBlockHeight = await this._makeHttpRequest(`${baseUrl}/blocks/tip/height`);
            } catch { /* optional */ }
            return { utxos, currentBlockHeight };
        } catch (err) {
            console.warn(`[MempoolService] getAddressUTXOs fallback failed for ${address}:`, err.message);
            return { utxos: [], currentBlockHeight: null };
        }
    }

    /**
     * Check if a specific UTXO is spent — tries Explorer API first
     */
    async isUtxoSpent(txid, vout, network = null) {
        try {
            const { explorerWalletService } = await import('./explorer-wallet-service');
            const targetNetwork = network || config.bitcoin.network;
            if (explorerWalletService.isAvailable(targetNetwork)) {
                return await explorerWalletService.isUtxoSpent(txid, vout, targetNetwork);
            }
        } catch (_) { /* fall through to mempool */ }

        const baseUrl = this._getMempoolUrl(network);
        const url = `${baseUrl}/tx/${txid}/outspend/${vout}`;
        const result = await this._makeHttpRequest(url);
        return result.spent === true;
    }

    /**
     * Broadcast a transaction — tries Explorer API first
     */
    async broadcastTransaction(txHex, network = null) {
        try {
            const { explorerWalletService } = await import('./explorer-wallet-service');
            const targetNetwork = network || config.bitcoin.network;
            if (explorerWalletService.isAvailable(targetNetwork)) {
                const result = await explorerWalletService.broadcastTransaction(txHex, targetNetwork);
                return result;
            }
        } catch (_) { /* fall through to mempool */ }

        const baseUrl = this._getMempoolUrl(network);
        const url = `${baseUrl}/tx`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
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
     * Get transaction details — tries Explorer API first, mempool.space as fallback
     */
    async getTransaction(txid, network = null) {
        // Primary: Explorer API
        try {
            const { explorerWalletService } = await import('./explorer-wallet-service');
            const targetNetwork = network || config.bitcoin.network;
            if (explorerWalletService.isAvailable(targetNetwork)) {
                const data = await explorerWalletService.getTransaction(txid, targetNetwork);
                if (data) return { tx: data, currentBlockHeight: null };
            }
        } catch (_) { /* fall through to mempool */ }

        // Fallback: mempool.space
        const baseUrl = this._getMempoolUrl(network);
        const url = `${baseUrl}/tx/${txid}`;

        const tx = await this._makeHttpRequest(url);

        let currentBlockHeight = null;
        if (tx.status?.confirmed && tx.status?.block_height) {
            try {
                const tipUrl = `${baseUrl}/blocks/tip/height`;
                currentBlockHeight = await this._makeHttpRequest(tipUrl);
            } catch (error) {}
        }

        return { tx, currentBlockHeight };
    }

    /**
     * Get transaction details with prevout data (for fee calculation)
     * Uses different endpoint that includes input values
     */
    async getTransactionWithPrevout(txid, network = null) {
        const baseUrl = this._getMempoolUrl(network);
        
        // First get basic transaction
        const basicTx = await this.getTransaction(txid, network);
        
        // Then get each input's prevout data
        if (basicTx.tx.vin && basicTx.tx.vin.length > 0) {
            for (let i = 0; i < basicTx.tx.vin.length; i++) {
                const input = basicTx.tx.vin[i];
                if (input.txid && input.vout !== undefined) {
                    try {
                        // Get the previous transaction to find output value
                        const prevTxUrl = `${baseUrl}/tx/${input.txid}`;
                        const prevTx = await this._makeHttpRequest(prevTxUrl);
                        
                        if (prevTx.vout && prevTx.vout[input.vout]) {
                            // Add prevout data to input
                            input.prevout = {
                                value: prevTx.vout[input.vout].value,
                                scriptpubkey: prevTx.vout[input.vout].scriptpubkey,
                                scriptpubkey_address: prevTx.vout[input.vout].scriptpubkey_address
                            };
                        }
                    } catch (error) {
                        console.warn(`[MempoolService] Failed to get prevout for input ${i}:`, error.message);
                        // Continue with other inputs
                    }
                }
            }
        }
        
        return basicTx;
    }

    /**
     * Get raw transaction hex — tries Explorer API first
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
            // Primary: Explorer API
            try {
                const { explorerWalletService } = await import('./explorer-wallet-service');
                if (explorerWalletService.isAvailable(targetNetwork)) {
                    const hex = await explorerWalletService.getTransactionHex(txid, targetNetwork);
                    if (hex) {
                        this.txHexCache.set(key, { value: hex, expiry: now + this.txCacheTTL });
                        return hex;
                    }
                }
            } catch (_) { /* fall through to mempool */ }

            // Fallback: mempool.space
            const baseUrl = this._getMempoolUrl(targetNetwork);
            const url = `${baseUrl}/tx/${txid}/hex`;
            const response = await fetch(url, {
                signal: this._createTimeoutSignal(this.timeout),
            });
            if (!response.ok) throw new Error(`Failed to get transaction hex: ${response.status}`);
            const result = await response.text();
            this.txHexCache.set(key, { value: result, expiry: now + this.txCacheTTL });
            return result;
        })()
            .finally(() => { this.inflight.delete(key); });

        this.inflight.set(key, p);
        return p;
    }

    /**
     * Get address transaction history — queries BOTH the Explorer API (indexed,
     * fast, tagged) and mempool.space (chain source of truth) in parallel,
     * then merges the results. Using only one source misses txs when the
     * indexer lags or returns a partial page.
     */
    async getAddressTransactions(address, network = null) {
        const targetNetwork = network || config.bitcoin.network;
        const baseUrl = this._getMempoolUrl(network);

        // Kick off both queries in parallel — Explorer paginates, mempool.space
        // returns ≤50 confirmed (newer) + ≤25 mempool. Merging covers both the
        // "indexer lag" case and the ">50 history" case.
        const explorerPromise = (async () => {
            try {
                const { explorerWalletService } = await import('./explorer-wallet-service');
                if (!explorerWalletService.isAvailable(targetNetwork)) return [];
                return await explorerWalletService.getAllTransactions(address, targetNetwork);
            } catch { return []; }
        })();
        const mempoolPromise = (async () => {
            try {
                return await this._makeHttpRequest(`${baseUrl}/address/${address}/txs`);
            } catch { return []; }
        })();

        const [explorerList, mempoolList] = await Promise.all([explorerPromise, mempoolPromise]);

        // Merge, Explorer wins on tagged data, mempool fills gaps
        const merged = new Map();
        for (const tx of explorerList) {
            const txid = tx.txid || tx.hash;
            if (txid) merged.set(txid, tx);
        }
        for (const tx of mempoolList) {
            const txid = tx.txid || tx.hash;
            if (!txid) continue;
            if (!merged.has(txid)) {
                // Normalize mempool.space shape to what the recorder expects
                merged.set(txid, {
                    txid,
                    block_height: tx.status?.block_height ?? null,
                    block_time: tx.status?.block_time ?? null,
                });
            }
        }
        return [...merged.values()];
    }

    /**
     * Get current network fee estimates — tries Explorer API first
     */
    async getFeeEstimates(network = null) {
        try {
            const { explorerWalletService } = await import('./explorer-wallet-service');
            const targetNetwork = network || config.bitcoin.network;
            if (explorerWalletService.isAvailable(targetNetwork)) {
                const fees = await explorerWalletService.getFeeEstimates(targetNetwork);
                if (fees) return fees;
            }
        } catch (_) { /* fall through to mempool */ }

        const baseUrl = this._getMempoolUrl(network);
        const url = `${baseUrl}/v1/fees/recommended`;
        const data = await this._makeHttpRequest(url);
        return {
            fastest: data.fastestFee || 20,
            halfHour: data.halfHourFee || 15,
            hour: data.hourFee || 10,
            economy: data.economyFee || 5,
            minimum: data.minimumFee || 1
        };
    }
}

export const mempoolService = new MempoolService();
export default mempoolService;
