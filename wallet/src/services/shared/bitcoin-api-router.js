'use client';

import config from '@/config';
import { quickNodeService } from './quicknode-service';
import { mempoolService } from './mempool-service';
import { NETWORKS } from '@/stores/blockchainStore';
import {
    normalizeMempoolUTXOs,
    normalizeMempoolTransaction,
    normalizeMempoolAddressData,
    normalizeUtxoVerification
} from './data-normalizers';

/**
 * Bitcoin API Router - QuickNode first, mempool.space fallback
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
     * Get current network - now passed as parameter from components
     */
    _getCurrentNetwork(network) {
        return network || config.bitcoin.network || 'mainnet';
    }

    /**
     * Check if any API is available (QuickNode or mempool.space)
     */
    isAvailable(network) {
        const currentNetwork = this._getCurrentNetwork(network);
        return quickNodeService.isAvailable(currentNetwork) || mempoolService.isAvailable(currentNetwork);
    }

    /**
     * Try QuickNode first, fallback to mempool.space with normalization
     */
    async _tryWithFallback(operation, ...args) {
        // Extract network from last arg if present
        const maybeNetwork = args.length > 0 ? args[args.length - 1] : null;
        const network = this._getCurrentNetwork(maybeNetwork);

        // Ensure downstream calls receive the resolved network
        const opArgs = [...args.slice(0, -1), network].filter((v) => v !== undefined);

        // Check QuickNode availability
        const isQuickNodeAvailable = quickNodeService.isAvailable(network);
        
        // Try QuickNode first if available
        if (isQuickNodeAvailable) {
            try {
                const result = await quickNodeService[operation](...opArgs);
                return result;
            } catch (error) {
                // Fallback to mempool.space on error
            }
        }

        // Fallback to mempool.space
        return await this._callMempoolWithNormalization(operation, ...opArgs);
    }

    /**
     * Call mempool.space and normalize response to QuickNode format
     */
    async _callMempoolWithNormalization(operation, ...args) {
        switch (operation) {
            case 'getAddressUTXOs': {
                const [address, network] = args;
                const { utxos, currentBlockHeight } = await mempoolService.getAddressUTXOs(address, network);
                return normalizeMempoolUTXOs(utxos, currentBlockHeight, address);
            }
            case 'getTransaction': {
                const [txid, network] = args;
                const { tx, currentBlockHeight } = await mempoolService.getTransaction(txid, network);
                return normalizeMempoolTransaction(tx, currentBlockHeight);
            }
            case 'isUtxoSpent':
            case 'broadcastTransaction':
            case 'getTransactionHex':
                return await mempoolService[operation](...args);
            case 'verifyUtxos': {
                const [utxos, network] = args;
                const results = await Promise.allSettled(
                    utxos.map(async (utxo) => {
                        const isSpent = await mempoolService.isUtxoSpent(utxo.txid, utxo.vout, network);
                        return { utxo, isSpent };
                    })
                );
                return normalizeUtxoVerification(results);
            }
            default:
                throw new Error(`Unsupported operation: ${operation}`);
        }
    }

    /**
     * Get UTXO information for an address
     * Tries QuickNode first, falls back to mempool.space
     */
    async getUTXOs(address, network) {
        return await this._tryWithFallback('getAddressUTXOs', address, network);
    }

    /**
     * Check if a specific UTXO is spent
     * Tries QuickNode first, falls back to mempool.space
     */
    async isUtxoSpent(txid, vout, network = null) {
        try {
            return await this._tryWithFallback('isUtxoSpent', txid, vout, network);
        } catch (error) {
            // If we can't check, assume unspent to avoid blocking transactions
            return false;
        }
    }

    /**
     * Verify a specific UTXO
     * Tries QuickNode first, falls back to mempool.space
     */
    async verifyUTXO(txid, vout, network) {
        try {
            const isSpent = await this.isUtxoSpent(txid, vout, network);
            return isSpent ? null : { value: 0 }; // Simplified response
        } catch (error) {
            return { value: 0 }; // Assume valid if verification fails
        }
    }

    /**
     * Broadcast a transaction
     * Tries QuickNode first, falls back to mempool.space
     */
    async broadcastTransaction(txHex, network) {
        return await this._tryWithFallback('broadcastTransaction', txHex, network);
    }

    /**
     * Get transaction details
     * Tries QuickNode first, falls back to mempool.space
     */
    async getTransaction(txid, network = null) {
        return await this._tryWithFallback('getTransaction', txid, network);
    }

    /**
     * Get raw transaction hex
     * Tries QuickNode first, falls back to mempool.space with caching
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
            const result = await this._tryWithFallback('getTransactionHex', txid, targetNetwork);
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
     * Tries QuickNode first, falls back to mempool.space
     */
    async verifyUtxos(utxos, network = null) {
        try {
            return await this._tryWithFallback('verifyUtxos', utxos, network);
        } catch (error) {
            // Return all as valid if verification fails to avoid blocking transactions
            return {
                validUtxos: utxos,
                spentUtxos: [],
                removedCount: 0
            };
        }
    }

    /**
     * Get current Bitcoin network fee estimates
     * Returns fee rates in sat/vB for different priority levels
     * Tries QuickNode first, falls back to mempool.space
     */
    async getFeeEstimates(network = null) {
        const targetNetwork = this._getCurrentNetwork(network);
        
        // Try QuickNode first if available
        if (quickNodeService.isAvailable(targetNetwork)) {
            try {
                const result = await quickNodeService.makeRequest('estimatesmartfee', [6], targetNetwork);
                
                if (result && result.feerate) {
                    // Convert BTC/kB to sat/vB: 1 BTC/kB = 100,000 sat/vB
                    const satPerVByte = Math.ceil(result.feerate * 100000);
                    
                    return {
                        success: true,
                        source: 'quicknode',
                        fees: {
                            fastest: satPerVByte + 2,
                            halfHour: satPerVByte,
                            hour: Math.max(1, satPerVByte - 1),
                            economy: Math.max(1, satPerVByte - 2),
                            minimum: 1
                        }
                    };
                }
            } catch (error) {
                // Fallback to mempool.space
            }
        }
        
        // Fallback to mempool.space
        try {
            const fees = await mempoolService.getFeeEstimates(targetNetwork);
            return {
                success: true,
                source: 'mempool.space',
                fees
            };
        } catch (error) {
            // Return defaults if all sources fail
            return {
                success: false,
                source: 'defaults',
                fees: {
                    fastest: 20,
                    halfHour: 15,
                    hour: 10,
                    economy: 5,
                    minimum: 1
                }
            };
        }
    }

    /**
     * RPC-style method wrapper with QuickNode-first fallback
     * Maps Bitcoin RPC methods to appropriate API calls (QuickNode or mempool.space)
     * Used by transaction history service and fee estimation
     */
    async makeRequest(method, params = [], network = null) {
        // Try QuickNode first if available
        if (quickNodeService.isAvailable(network)) {
            try {
                return await quickNodeService.makeRequest(method, params, network);
            } catch (error) {
            }
        }

        // Fallback to mempool.space with method mapping
        switch (method) {
            case 'bb_getutxos':
                if (params.length > 0) {
                    return this.getUTXOs(params[0], network);
                }
                throw new Error('bb_getutxos requires address parameter');

            case 'bb_getaddress':
                if (params.length > 0) {
                    const txs = await mempoolService.getAddressTransactions(params[0], network);
                    return normalizeMempoolAddressData(txs, params[0]);
                }
                throw new Error('bb_getaddress requires address parameter');

            case 'bb_gettransaction':
                if (params.length > 0) {
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
