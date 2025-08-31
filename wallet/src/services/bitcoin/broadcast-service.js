'use client';

import config from '@/config';
import { quickNodeService } from '@/services/shared/quicknode-service';
import { utxoVerifier } from '@/services/utxo/core/verifier';
import { BLOCKCHAINS } from '@/stores/blockchainStore';
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
                
                throw new Error('UTXOs were spent. Please refresh your wallet and try again.');
            }

            throw error;
        }
    }
}

export default BitcoinBroadcastService;
