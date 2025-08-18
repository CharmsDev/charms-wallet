'use client';

import { BitcoinScureSigner } from '../wallet/bitcoin-scure-signer';
import { UtxoSelector } from '../wallet/utxo-selector';
import BitcoinBroadcastService from './broadcast-service';

/**
 * Simplified Bitcoin Transaction Orchestrator
 * Coordinates UTXO selection, transaction signing, and broadcasting
 */
export class BitcoinTransactionOrchestrator {
    constructor() {
        this.broadcastService = new BitcoinBroadcastService();
        this.utxoSelector = new UtxoSelector();
        this.signer = new BitcoinScureSigner();
    }

    /**
     * Process complete Bitcoin transaction: select UTXOs, sign, and prepare for broadcast
     */
    async processTransaction(destinationAddress, amountInSats, availableUtxos, feeRate = 5, updateStateCallback = null) {
        try {
            console.log('[BitcoinTransactionOrchestrator] Processing transaction...');
            console.log(`[BitcoinTransactionOrchestrator] Amount: ${amountInSats} sats to ${destinationAddress}`);

            const amountInSatsInt = parseInt(amountInSats);

            // Select UTXOs
            const selectionResult = await this.utxoSelector.selectUtxosForAmountDynamic(
                availableUtxos,
                amountInSatsInt,
                feeRate,
                updateStateCallback
            );

            console.log(`[BitcoinTransactionOrchestrator] Selected ${selectionResult.selectedUtxos.length} UTXOs`);

            // Prepare transaction data
            const transactionData = {
                destinationAddress,
                amount: amountInSats / 100000000, // Convert to BTC
                utxos: selectionResult.selectedUtxos,
                feeRate,
                amountInSats: amountInSatsInt
            };

            // Sign transaction
            const signingResult = await this.signer.createAndSignTransaction(transactionData);
            
            if (!signingResult.success) {
                throw new Error(signingResult.error || 'Transaction signing failed');
            }

            console.log('[BitcoinTransactionOrchestrator] ✅ Transaction signed successfully');

            return {
                success: true,
                signedTxHex: signingResult.signedTxHex,
                txid: signingResult.txid,
                selectedUtxos: selectionResult.selectedUtxos,
                totalSelected: selectionResult.totalSelected,
                estimatedFee: selectionResult.estimatedFee,
                change: selectionResult.change,
                transactionMetadata: transactionData
            };

        } catch (error) {
            console.error('[BitcoinTransactionOrchestrator] Transaction processing failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Broadcast transaction with retry logic
     */
    async broadcastTransaction(signedTxHex, selectedUtxos, transactionData, updateStateCallback = null) {
        try {
            return await this.broadcastService.broadcastWithRetry(
                signedTxHex,
                selectedUtxos,
                transactionData,
                updateStateCallback
            );
        } catch (error) {
            console.error('[BitcoinTransactionOrchestrator] Broadcast failed:', error);
            throw error;
        }
    }

    /**
     * Complete transaction process: process + broadcast
     */
    async sendTransaction(destinationAddress, amountInSats, availableUtxos, feeRate = 5, updateStateCallback = null) {
        try {
            // Process transaction
            const processResult = await this.processTransaction(
                destinationAddress,
                amountInSats,
                availableUtxos,
                feeRate,
                updateStateCallback
            );

            if (!processResult.success) {
                throw new Error(processResult.error);
            }

            // Broadcast transaction
            const broadcastResult = await this.broadcastTransaction(
                processResult.signedTxHex,
                processResult.selectedUtxos,
                processResult.transactionMetadata,
                updateStateCallback
            );

            return {
                success: true,
                txid: broadcastResult.txid,
                selectedUtxos: processResult.selectedUtxos,
                totalSelected: processResult.totalSelected,
                estimatedFee: processResult.estimatedFee,
                change: processResult.change
            };

        } catch (error) {
            console.error('[BitcoinTransactionOrchestrator] Send transaction failed:', error);
            throw error;
        }
    }
}

export default BitcoinTransactionOrchestrator;
