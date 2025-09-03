import * as bitcoin from 'bitcoinjs-lib';
import { bitcoinApiRouter } from '@/services/shared/bitcoin-api-router';

/**
 * Fetches a transaction using QuickNode service by its transaction ID
 * Includes detailed logging for debugging
 */
export async function fetchTransaction(txid: string, network?: string): Promise<bitcoin.Transaction | null> {
    try {
        // Get transaction hex using Bitcoin API Router
        const txHex = await bitcoinApiRouter.getTransactionHex(txid, network);
        if (!txHex) {
            return null;
        }

        // Parse the transaction hex
        const tx = bitcoin.Transaction.fromHex(txHex);
        return tx;
    } catch (error) {
        console.error(`Error fetching transaction ${txid}:`, error);
        return null;
    }
}
