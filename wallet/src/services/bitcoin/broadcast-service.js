'use client';

import config from '@/config';
import { quickNodeService } from './quicknode-service.js';
export class BitcoinBroadcastService {
    constructor() {
        this.maxRetries = 2;
    }

    async broadcastTransaction(txHex, network = null) {
        if (quickNodeService.isAvailable(network)) {
            try {
                const txid = await quickNodeService.broadcastTransaction(txHex, network);
                return {
                    success: true,
                    txid: txid.trim()
                };
            } catch (quickNodeError) {
                // Fallback to mempool.space
            }
        }

        const apiUrl = config.bitcoin.getMempoolApiUrl();
        if (!apiUrl) {
            throw new Error('No broadcast API available for current network');
        }

        const response = await fetch(`${apiUrl}/tx`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: txHex,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }

        const txid = await response.text();
        return {
            success: true,
            txid: txid.trim()
        };
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
