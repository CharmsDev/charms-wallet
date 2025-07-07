import * as bitcoin from 'bitcoinjs-lib';
import config from '@/config';

/**
 * Fetches a transaction from mempool.space by its transaction ID
 * Includes detailed logging for debugging
 */
export async function fetchTransaction(txid: string): Promise<bitcoin.Transaction | null> {
    try {
        const mempoolApiUrl = config.bitcoin.getMempoolApiUrl();
        if (!mempoolApiUrl) {
            return null;
        }

        const url = `${mempoolApiUrl}/tx/${txid}/hex`;
        const response = await fetch(url);
        if (!response.ok) {
            return null;
        }

        const txHex = await response.text();
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
