'use client';

import config from '@/config';
import { bitcoinApiRouter } from '@/services/shared/bitcoin-api-router';
import { utxoVerifier } from '@/services/utxo/core/verifier';
import { BLOCKCHAINS } from '@/stores/blockchainStore';
export class BitcoinBroadcastService {
    constructor() {
        this.maxRetries = 2;
    }

    async broadcastTransaction(txHex, network = null) {
        try {
            const txid = await bitcoinApiRouter.broadcastTransaction(txHex, network);
            return {
                success: true,
                txid: txid.trim()
            };
        } catch (error) {
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
                // Immediately remove spent UTXOs from storage/state (no blacklist)
                try {
                    for (const utxo of selectedUtxos) {
                        await utxoVerifier.removeUtxo(utxo.txid, utxo.vout, BLOCKCHAINS.BITCOIN, network);
                    }
                } catch (_) {}
                
                if (utxoUpdateCallback) {
                    try {
                        await utxoUpdateCallback(selectedUtxos, {});
                    } catch (updateError) {
                        // Silent fail
                    }
                }
                
                throw new Error('UTXOs were spent. Wallet refresh required.');
            }

            throw error;
        }
    }
}

export default BitcoinBroadcastService;
