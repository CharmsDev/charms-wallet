'use client';

import config from '@/config';
import { quickNodeService } from '@/services/shared/quicknode-service';
export class BitcoinBroadcastService {
    constructor() {
        this.maxRetries = 2;
    }

    async broadcastTransaction(txHex, network = null) {
        // Use QuickNode service exclusively - no fallbacks
        if (!quickNodeService.isAvailable(network)) {
            throw new Error(`QuickNode not configured for network: ${network}`);
        }

        try {
            const txid = await quickNodeService.broadcastTransaction(txHex, network);
            return {
                success: true,
                txid: txid.trim()
            };
        } catch (error) {
            console.error('[BroadcastService] QuickNode broadcast failed:', error);
            throw error;
        }
    }

    async broadcastWithRetry(txHex, selectedUtxos, transactionData, utxoUpdateCallback = null, network = null) {
        try {
            const result = await this.broadcastTransaction(txHex, network);
            
            if (utxoUpdateCallback) {
                try {
                    await utxoUpdateCallback(selectedUtxos, {});
                } catch (error) {
                    // Silent fail - don't break the flow
                }
            }

            return result;

        } catch (error) {
            if (error.message.includes('bad-txns-inputs-missingorspent')) {
                this.markUtxosAsSpent(selectedUtxos);
                
                if (utxoUpdateCallback) {
                    try {
                        await utxoUpdateCallback(selectedUtxos, {});
                    } catch (updateError) {
                        // Silent fail
                    }
                }
                
                throw new Error('UTXOs were spent. Please refresh your wallet and try again.');
            }

            throw error;
        }
    }

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
        } catch (error) {
            // Silent fail
        }
    }

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

export default BitcoinBroadcastService;
