'use client';

import { BitcoinScureSigner } from '../wallet/bitcoin-scure-signer';
import { UtxoSelector } from '@/services/utxo';
import BitcoinBroadcastService from './broadcast-service';
import TransactionRecorder from '@/services/transactions/transaction-recorder';
import { BLOCKCHAINS } from '@/stores/blockchainStore';
import { getCharms } from '@/services/storage';

export class BitcoinTransactionOrchestrator {
    constructor(network) {
        if (!network) {
            throw new Error('BitcoinTransactionOrchestrator requires a network.');
        }
        this.network = network;
        this.broadcastService = new BitcoinBroadcastService();
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

        // Defense-in-depth: verify no selected UTXOs are charm UTXOs before signing
        try {
            const charms = await getCharms(BLOCKCHAINS.BITCOIN, this.network);
            const charmIds = new Set(
                (charms || []).flatMap(ch => {
                    const ids = [];
                    if (ch?.txid !== undefined && ch?.outputIndex !== undefined) {
                        ids.push(`${ch.txid}:${ch.outputIndex}`);
                    }
                    if (typeof ch?.uniqueId === 'string') {
                        const uid = ch.uniqueId;
                        if (/^[0-9a-fA-F]+:\\d+$/.test(uid)) {
                            ids.push(uid);
                        } else if (uid.includes('-')) {
                            const parts = uid.split('-');
                            if (parts.length >= 3) {
                                const txid = parts[0];
                                const vout = parts[parts.length - 1];
                                if (/^\d+$/.test(vout)) ids.push(`${txid}:${vout}`);
                            }
                        }
                    }
                    return ids;
                })
            );

            const offending = (selectionResult.selectedUtxos || []).filter(u =>
                charmIds.has(`${u.txid}:${u.vout}`)
            );
            if (offending.length > 0) {
                throw new Error('Charm-protected UTXOs detected in selection. Aborting transaction.');
            }
        } catch (e) {
            if (e && e.message && e.message.includes('Charm-protected')) throw e;
            // If charms retrieval fails, proceed but log - selector already filtered them
            // console.warn('[Orchestrator] Charm validation skipped due to error:', e);
        }

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
                // Prepare inputs from selected UTXOs
                const inputs = processResult.selectedUtxos.map(utxo => ({
                    txid: utxo.txid,
                    vout: utxo.vout,
                    address: utxo.address,
                    value: utxo.value
                }));

                // Prepare outputs (destination + change if exists)
                const outputs = [
                    {
                        address: destinationAddress,
                        amount: amountInSats,
                        vout: 0
                    }
                ];
                
                if (processResult.change > 0 && processResult.changeAddress) {
                    outputs.push({
                        address: processResult.changeAddress,
                        amount: processResult.change,
                        vout: 1
                    });
                }

                const recordedTransaction = await this.transactionRecorder.recordSentTransaction(
                    {
                        txid: broadcastResult.txid,
                        amountInSats: amountInSats,
                        change: processResult.change,
                        totalSelected: processResult.totalSelected,
                        inputs: inputs,
                        outputs: outputs
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
