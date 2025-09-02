'use client';

import { BitcoinScureSigner } from '../wallet/bitcoin-scure-signer';
import { UtxoSelector } from '@/services/utxo';
import BitcoinBroadcastService from './broadcast-service';
import TransactionRecorder from '@/services/transactions/transaction-recorder';
import { BLOCKCHAINS } from '@/stores/blockchainStore';

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
            updateStateCallback,
            BLOCKCHAINS.BITCOIN,
            this.network
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
            updateStateCallback,
            this.network
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
        if (broadcastResult.success && broadcastResult.txid) {
            try {
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

                // Dispatch event to update UI
                if (typeof window !== 'undefined') {
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
                // Don't fail the entire transaction if recording fails
            }
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
