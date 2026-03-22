'use client';

import config from '@/config';
import { mempoolService } from './mempool-service';
import { explorerWalletService } from './explorer-wallet-service';
import {
    normalizeMempoolUTXOs,
    normalizeMempoolTransaction,
    normalizeMempoolAddressData,
    normalizeUtxoVerification
} from './data-normalizers';

/**
 * Bitcoin API Router — Explorer API primary, mempool.space failover
 */
export class BitcoinApiRouter {
    constructor() {
        this.timeout = 10000;
        this.txHexCache = new Map();
        this.txCacheTTL = 60 * 1000;
        this.inflight = new Map();
    }

    _getCurrentNetwork(network) {
        return network || config.bitcoin.network || 'mainnet';
    }

    isAvailable(network) {
        const currentNetwork = this._getCurrentNetwork(network);
        return explorerWalletService.isAvailable(currentNetwork) || mempoolService.isAvailable(currentNetwork);
    }

    /**
     * Try Explorer API first, then mempool.space
     */
    async _tryWithFallback(operation, ...args) {
        const maybeNetwork = args.length > 0 ? args[args.length - 1] : null;
        const network = this._getCurrentNetwork(maybeNetwork);
        const opArgs = [...args.slice(0, -1), network].filter((v) => v !== undefined);

        // Primary: Explorer API
        if (explorerWalletService.isAvailable(network) && typeof explorerWalletService[operation] === 'function') {
            try {
                return await explorerWalletService[operation](...opArgs);
            } catch (error) {
                console.warn(`[ApiRouter] Explorer failed for ${operation}:`, error.message);
            }
        }

        // Failover: mempool.space
        return await this._callMempoolWithNormalization(operation, ...opArgs);
    }

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

    async getUTXOs(address, network) {
        return await this._tryWithFallback('getAddressUTXOs', address, network);
    }

    async isUtxoSpent(txid, vout, network = null) {
        try {
            return await this._tryWithFallback('isUtxoSpent', txid, vout, network);
        } catch (error) {
            return false;
        }
    }

    async broadcastTransaction(txHex, network) {
        return await this._tryWithFallback('broadcastTransaction', txHex, network);
    }

    async sendRawTransaction(txHex, network) {
        return await this.broadcastTransaction(txHex, network);
    }

    async getTransaction(txid, network = null) {
        return await this._tryWithFallback('getTransaction', txid, network);
    }

    async getTransactionWithPrevout(txid, network = null) {
        const currentNetwork = this._getCurrentNetwork(network);
        try {
            return await mempoolService.getTransactionWithPrevout(txid, currentNetwork);
        } catch (error) {
            return await this.getTransaction(txid, currentNetwork);
        }
    }

    async getTransactionHex(txid, network = null) {
        const targetNetwork = network || config.bitcoin.network;
        const key = `${targetNetwork}:${txid}`;
        const now = Date.now();

        const cached = this.txHexCache.get(key);
        if (cached && cached.expiry > now) return cached.value;
        if (this.inflight.has(key)) return this.inflight.get(key);

        const p = (async () => {
            const result = await this._tryWithFallback('getTransactionHex', txid, targetNetwork);
            this.txHexCache.set(key, { value: result, expiry: now + this.txCacheTTL });
            return result;
        })().finally(() => this.inflight.delete(key));

        this.inflight.set(key, p);
        return p;
    }

    async verifyUtxos(utxos, network = null) {
        try {
            return await this._tryWithFallback('verifyUtxos', utxos, network);
        } catch (error) {
            return { validUtxos: utxos, spentUtxos: [], removedCount: 0 };
        }
    }

    async getFeeEstimates(network = null) {
        const targetNetwork = this._getCurrentNetwork(network);

        if (explorerWalletService.isAvailable(targetNetwork)) {
            try {
                const fees = await explorerWalletService.getFeeEstimates(targetNetwork);
                return { success: true, source: 'explorer', fees };
            } catch (error) {
                console.warn('[ApiRouter] Explorer fee estimate failed:', error.message);
            }
        }

        try {
            const fees = await mempoolService.getFeeEstimates(targetNetwork);
            return { success: true, source: 'mempool.space', fees };
        } catch (error) {
            return {
                success: false,
                source: 'defaults',
                fees: { fastest: 20, halfHour: 15, hour: 10, economy: 5, minimum: 1 }
            };
        }
    }

    async makeRequest(method, params = [], network = null) {
        switch (method) {
            case 'bb_getutxos':
                if (params.length > 0) return this.getUTXOs(params[0], network);
                throw new Error('bb_getutxos requires address parameter');
            case 'bb_getaddress':
                if (params.length > 0) {
                    const txs = await mempoolService.getAddressTransactions(params[0], network);
                    return normalizeMempoolAddressData(txs, params[0]);
                }
                throw new Error('bb_getaddress requires address parameter');
            case 'gettxout':
                if (params.length >= 2) {
                    const isSpent = await this.isUtxoSpent(params[0], params[1], network);
                    return isSpent ? null : { value: 0 };
                }
                throw new Error('gettxout requires txid and vout parameters');
            case 'sendrawtransaction':
                if (params.length > 0) return this.broadcastTransaction(params[0], network);
                throw new Error('sendrawtransaction requires hex parameter');
            case 'getrawtransaction':
                if (params.length > 0) {
                    return params[1] === true
                        ? this.getTransaction(params[0], network)
                        : this.getTransactionHex(params[0], network);
                }
                throw new Error('getrawtransaction requires txid parameter');
            default:
                throw new Error(`Unsupported RPC method: ${method}`);
        }
    }
}

export const bitcoinApiRouter = new BitcoinApiRouter();
export default bitcoinApiRouter;
