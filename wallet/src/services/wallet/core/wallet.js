import { utxoService } from '@/services/utxo';
import { broadcastService } from '@/services/wallet/broadcast-service';
import { signTransaction } from './sign';
import { createUnsignedTransaction } from './transaction';
import { getAddresses } from '@/services/storage';

// Core wallet functionality implementation
class WalletCore {
    // Send Bitcoin transaction to a destination address
    async sendBitcoin(params) {
        try {
            // Parameter validation
            if (!params.destinationAddress) {
                throw new Error('Destination address is required');
            }

            if (!params.amount || params.amount <= 0) {
                throw new Error('Amount must be greater than 0');
            }

            // Retrieve available UTXOs from storage
            const utxoMap = await utxoService.getStoredUTXOs();

            // Select optimal UTXOs for transaction
            const selectedUtxos = utxoService.selectUtxos(utxoMap, params.amount, params.feeRate || 1);

            if (!selectedUtxos || selectedUtxos.length === 0) {
                throw new Error('Insufficient funds for transaction');
            }

            // Prepare transaction data
            const transactionData = {
                utxos: selectedUtxos,
                destinationAddress: params.destinationAddress,
                amount: params.amount,
                feeRate: params.feeRate || 1,
                changeAddress: params.changeAddress
            };

            // Generate and sign transaction
            const unsignedTxHex = await createUnsignedTransaction(transactionData);
            const signedTxHex = await signTransaction(unsignedTxHex);

            // Broadcast to network
            const broadcastResult = await broadcastService.broadcastTransaction(signedTxHex.signedTxHex);

            return {
                txid: broadcastResult.txid,
                hex: signedTxHex.signedTxHex,
                amount: params.amount,
                fee: utxoService.calculateFee(selectedUtxos.length, 2, params.feeRate || 1) / 100000000,
                success: true
            };
        } catch (error) {
            throw error;
        }
    }

    // Calculate wallet balance in BTC
    async getBalance() {
        try {
            // Retrieve UTXOs from storage
            const utxoMap = await utxoService.getStoredUTXOs();

            // Sum all UTXO values
            const totalSats = utxoService.calculateTotalBalance(utxoMap);

            // Convert satoshis to BTC
            return totalSats / 100000000;
        } catch (error) {
            throw error;
        }
    }

    // Update UTXOs for all wallet addresses
    async refreshUTXOs() {
        try {
            return await utxoService.fetchAndStoreAllUTXOs();
        } catch (error) {
            throw error;
        }
    }

    // Retrieve transaction confirmation status
    async getTransactionStatus(txid) {
        try {
            return await broadcastService.getTransactionStatus(txid);
        } catch (error) {
            throw error;
        }
    }
}

// Singleton instance export
export const walletCore = new WalletCore();

export default walletCore;
