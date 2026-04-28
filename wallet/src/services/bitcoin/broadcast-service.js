'use client';

import { bitcoinApiRouter } from '@/services/shared/bitcoin-api-router';
import { utxoVerifier } from '@/services/utxo/core/verifier';
import { BLOCKCHAINS } from '@/stores/blockchainStore';

export class BitcoinBroadcastService {
    constructor() {
        this.maxRetries = 2;
        this.apiRouter = bitcoinApiRouter;
    }

    async broadcastTransaction(txHex, network) {
        try {
            const txid = await this.apiRouter.broadcastTransaction(txHex, network);
            // Reserve every input the broadcast tx consumed. Defence-in-depth
            // against concurrent ops in the same session re-picking the same
            // UTXO before the tx confirms. Cleared by `syncWithChain` on next
            // refresh.
            try {
                const bitcoin = await import('bitcoinjs-lib');
                const tx = bitcoin.Transaction.fromHex(txHex);
                const items = tx.ins.map(inp => ({
                    txid: Buffer.from(inp.hash).reverse().toString('hex'),
                    vout: inp.index,
                }));
                if (items.length) {
                    const { markBatch } = await import('@/services/utxo-reservations');
                    markBatch('bitcoin', items);
                }
            } catch (e) {
                console.warn('[BTC broadcast] reservation skip:', e?.message || e);
            }
            return {
                success: true,
                txid: txid.trim()
            };
        } catch (error) {
            throw error;
        }
    }

    async broadcastWithRetry(txHex, selectedUtxos, transactionData, utxoUpdateCallback = null, network) {
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
