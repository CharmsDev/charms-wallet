import bitcoinScureSigner from './bitcoin-scure-signer';
import { broadcastService } from './broadcast-service';
import { utxoService } from '@/services/utxo';

/**
 * Transaction Orchestrator - Coordinates transaction creation, signing, and broadcasting
 */
export class TransactionOrchestrator {
    constructor() {
        this.broadcastService = broadcastService;
        this.spentUtxosBlacklist = new Set([
            '0847f5b6957b3e0e96002323f47324fc9cc25aedceb79f4520369cd1abdc2957:1'
        ]);
    }

    filterValidUtxos(utxos) {
        return utxos.filter(utxo => {
            const utxoKey = `${utxo.txid}:${utxo.vout}`;
            if (this.spentUtxosBlacklist.has(utxoKey)) return false;
            return true;
        });
    }

    // Refresh UTXO set and keep only those still unspent (and not blacklisted)
    async verifyAndFilterUtxos(selectedUtxos) {
        try {
            // Try to refresh; on failure, fall back to stored set
            await utxoService.fetchAndStoreAllUTXOs();
        } catch (_) { /* ignore refresh errors */ }

        const utxoMap = await utxoService.getStoredUTXOs();
        const latestSet = new Set();
        Object.entries(utxoMap).forEach(([address, utxos]) => {
            utxos.forEach(u => latestSet.add(`${u.txid}:${u.vout}`));
        });

        const notBlacklisted = this.filterValidUtxos(selectedUtxos);
        return notBlacklisted.filter(u => latestSet.has(`${u.txid}:${u.vout}`));
    }

    async processTransaction(destinationAddress, amountBTC, selectedUtxos, feeRate = 1) {
        try {
            const validUtxos = await this.verifyAndFilterUtxos(selectedUtxos);

            if (validUtxos.length === 0) {
                throw new Error('No valid UTXOs available after filtering');
            }

            const transactionData = {
                destinationAddress,
                amount: parseFloat(amountBTC),
                utxos: validUtxos,
                feeRate
            };

            const { signedTxHex, txid } = await bitcoinScureSigner.createAndSignTransaction(transactionData);

            return {
                success: true,
                signedTxHex,
                txid: txid || null
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async broadcastTransaction(signedTxHex) {
        return await this.broadcastService.broadcastTransaction(signedTxHex);
    }
}
