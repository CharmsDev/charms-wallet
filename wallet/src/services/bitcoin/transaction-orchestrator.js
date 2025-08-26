'use client';

import { BitcoinScureSigner } from '../wallet/bitcoin-scure-signer';
import { UtxoSelector } from '@/services/utxo';
import BitcoinBroadcastService from './broadcast-service';
import TransactionRecorder from '@/services/transactions/transaction-recorder';

export class BitcoinTransactionOrchestrator {
    constructor(network) {
        if (!network) {
            throw new Error('BitcoinTransactionOrchestrator requires a network.');
        }
        this.network = network;
        this.broadcastService = new BitcoinBroadcastService(network);
        this.utxoSelector = new UtxoSelector();
        this.signer = new BitcoinScureSigner(network);
        this.transactionRecorder = new TransactionRecorder('bitcoin', network);
    }

    async processTransaction(destinationAddress, amountInSats, availableUtxos, feeRate = 5, updateStateCallback = null) {
        const amountInSatsInt = parseInt(amountInSats);

        const selectionResult = await this.utxoSelector.selectUtxosForAmountDynamic(
            availableUtxos,
            amountInSatsInt,
            feeRate,
            updateStateCallback
        );

        const transactionData = {
            destinationAddress,
            amount: amountInSats / 100000000,
            utxos: selectionResult.selectedUtxos,
            feeRate,
            amountInSats: amountInSatsInt
        };

        const signingResult = await this.signer.createAndSignTransaction(transactionData);

        if (!signingResult.success) {
            throw new Error(signingResult.error || 'Transaction signing failed');
        }

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
    }

    async broadcastTransaction(signedTxHex, selectedUtxos, transactionData, updateStateCallback = null) {
        return await this.broadcastService.broadcastWithRetry(
            signedTxHex,
            selectedUtxos,
            transactionData,
            updateStateCallback
        );
    }

    async sendTransaction(destinationAddress, amountInSats, availableUtxos, feeRate = 5, updateStateCallback = null) {
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

        const broadcastResult = await this.broadcastTransaction(
            processResult.signedTxHex,
            processResult.selectedUtxos,
            processResult.transactionMetadata,
            updateStateCallback
        );

        // Record sent transaction after successful broadcast
        console.log(`[TRANSACTION ORCHESTRATOR] Broadcast result:`, broadcastResult);
        if (broadcastResult.success && broadcastResult.txid) {
            console.log(`[TRANSACTION ORCHESTRATOR] ✅ Starting to record sent transaction: ${broadcastResult.txid}`);
            try {
                // Record sent transaction using the transaction recorder
                const recordedTransaction = await this.transactionRecorder.recordSentTransaction(
                    {
                        txid: broadcastResult.txid,
                        amountInSats: amountInSats,
                        change: processResult.change,
                        totalSelected: processResult.totalSelected
                    },
                    processResult.estimatedFee,
                    {
                        from: processResult.selectedUtxos.map(utxo => utxo.address),
                        to: [destinationAddress]
                    }
                );

                console.log(`[TRANSACTION ORCHESTRATOR] ✅ Successfully recorded sent transaction: ${broadcastResult.txid}`);
                
                // Force reload transactions to update UI immediately
                if (typeof window !== 'undefined') {
                    console.log(`[TRANSACTION ORCHESTRATOR] Dispatching transactionRecorded event`);
                    const event = new CustomEvent('transactionRecorded', { 
                        detail: { 
                            txid: broadcastResult.txid,
                            type: 'sent',
                            transaction: recordedTransaction
                        } 
                    });
                    window.dispatchEvent(event);
                }
                
            } catch (recordError) {
                console.error('[TRANSACTION ORCHESTRATOR] ❌ Failed to record sent transaction:', recordError);
                console.error('[TRANSACTION ORCHESTRATOR] Error details:', recordError.stack);
                // Don't fail the entire transaction if recording fails
            }
        } else {
            console.warn('[TRANSACTION ORCHESTRATOR] ❌ Broadcast result missing success or txid:', broadcastResult);
        }

        return {
            success: true,
            txid: broadcastResult.txid,
            selectedUtxos: processResult.selectedUtxos,
            totalSelected: processResult.totalSelected,
            estimatedFee: processResult.estimatedFee,
            change: processResult.change
        };
    }
}

export default BitcoinTransactionOrchestrator;
