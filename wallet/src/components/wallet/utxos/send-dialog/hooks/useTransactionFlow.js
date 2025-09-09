import { useState, useCallback } from 'react';
import BitcoinTransactionOrchestrator from '@/services/bitcoin/transaction-orchestrator';
import { decodeTx } from '@/lib/bitcoin/txDecoder';
import { useUTXOs } from '@/stores/utxoStore';
import { useBlockchain } from '@/stores/blockchainStore';
import { useAddresses } from '@/stores/addressesStore';
import config from '@/config';

export function useTransactionFlow(formState, onClose) {
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [showPreparing, setShowPreparing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [txId, setTxId] = useState(null);
    const [transactionData, setTransactionData] = useState(null);
    const [preparingStatus, setPreparingStatus] = useState('');

    const { updateAfterTransaction, utxos } = useUTXOs();
    const { activeNetwork } = useBlockchain();
    const { addresses } = useAddresses();

    const handleSendClick = async () => {
        try {

            if (!formState.destinationAddress || !formState.amount) {
                formState.setError('Please fill in destination address and amount.');
                return;
            }

            const amountInSats = parseInt(formState.amount, 10);
            if (isNaN(amountInSats) || amountInSats < 547) {
                formState.setError('The minimum amount to send is 547 satoshis.');
                return;
            }

            // Check UTXOs availability
            if (!utxos || Object.keys(utxos).length === 0) {
                formState.setError('No UTXOs available. Please refresh your wallet.');
                return;
            }

            // Check addresses loaded
            if (!addresses || addresses.length === 0) {
                formState.setError('Wallet addresses not loaded. Please refresh your wallet.');
                return;
            }

            formState.setError('');
            setShowPreparing(true);
            setPreparingStatus('Selecting UTXOs and calculating fees...');
            
            // Create set of valid addresses from current address store
            const validAddresses = new Set(addresses.map(addr => addr.address));
            const allUtxos = utxos ? Object.entries(utxos).flatMap(([address, addressUtxos]) => {
                if (!validAddresses.has(address)) {
                    return [];
                }
                return addressUtxos.map(utxo => ({ ...utxo, address }));
            }) : [];

            // Precalculate UTXO selection, fees, and change
            
            // Import UTXO selector for preselection
            const { UTXOSelector } = await import('@/services/utxo/core/selector');
            const selector = new UTXOSelector();
            
            // Get network fee rate
            const { bitcoinApiRouter } = await import('@/services/shared/bitcoin-api-router');
            const feeEstimates = await bitcoinApiRouter.getFeeEstimates(activeNetwork);
            const currentFeeRate = feeEstimates.fees.halfHour;
            
            

            // Select UTXOs and calculate fees
            const selectionResult = await selector.selectUtxosForAmountDynamic(
                allUtxos,
                amountInSats,
                currentFeeRate,
                null,
                updateAfterTransaction,
                'bitcoin',
                activeNetwork
            );
            
            
            // Create transaction and get decoded data
            
            const orchestrator = new BitcoinTransactionOrchestrator(activeNetwork);
            
            const result = await orchestrator.processTransaction(
                formState.destinationAddress,
                selectionResult.adjustedAmount || amountInSats,
                selectionResult.selectedUtxos,
                currentFeeRate,
                updateAfterTransaction
            );

            if (!result.success) throw new Error(result.error);

            // Store precalculated data with decoded transaction
            const precalculatedData = {
                selectedUtxos: selectionResult.selectedUtxos,
                totalSelected: selectionResult.totalSelected,
                estimatedFee: selectionResult.estimatedFee,
                change: selectionResult.change,
                adjustedAmount: selectionResult.adjustedAmount || amountInSats,
                destinationAddress: formState.destinationAddress,
                originalAmount: amountInSats,
                txHex: result.signedTxHex,
                decodedTx: decodeTx(result.signedTxHex, activeNetwork)
            };
            
            setTransactionData(precalculatedData);
            setShowPreparing(false);
            setShowConfirmation(true);
            
            

        } catch (err) {
            setShowPreparing(false);
            formState.setError(err.message || 'Transaction preparation failed');
        }
    };

    const handleConfirmSend = async () => {
        try {
            setIsSubmitting(true);
            formState.setError('');

            // Use precalculated transaction data
            if (!transactionData) {
                throw new Error('No precalculated transaction data available');
            }


            // Verify UTXOs availability before broadcast
            const { bitcoinApiRouter } = await import('@/services/shared/bitcoin-api-router');
            
            // Verify each UTXO
            const utxoVerifications = await Promise.allSettled(
                transactionData.selectedUtxos.map(async (utxo) => {
                    try {
                        const isSpent = await bitcoinApiRouter.isUtxoSpent(utxo.txid, utxo.vout, activeNetwork);
                        return { utxo: `${utxo.txid}:${utxo.vout}`, isSpent, value: utxo.value };
                    } catch (error) {
                        return { utxo: `${utxo.txid}:${utxo.vout}`, isSpent: false, error: error.message };
                    }
                })
            );

            // Check spent UTXOs
            const spentUtxos = utxoVerifications
                .filter(result => result.status === 'fulfilled' && result.value.isSpent)
                .map(result => result.value);

            const failedVerifications = utxoVerifications
                .filter(result => result.status === 'rejected' || result.value.error)
                .map(result => result.status === 'fulfilled' ? result.value : { error: result.reason });


            if (spentUtxos.length > 0) {
                throw new Error(`${spentUtxos.length} UTXO(s) were spent by another transaction. Please refresh your wallet and try again.`);
            }

            if (failedVerifications.length > 0) {
            }

            const orchestrator = new BitcoinTransactionOrchestrator(activeNetwork);
            
            // Broadcast pre-created transaction
            const broadcastResult = await orchestrator.broadcastService.broadcastTransaction(transactionData.txHex, activeNetwork);
            
            if (!broadcastResult.success) {
                throw new Error(broadcastResult.error || 'Failed to broadcast transaction');
            }

            setTxId(broadcastResult.txid);
            setShowConfirmation(false);
            setShowSuccess(true);

        } catch (err) {
            setShowPreparing(false);
            
            if (err.message.includes('bad-txns-inputs-missingorspent') || err.message.includes('UTXOs were spent')) {
                formState.setError('The UTXOs used in this transaction are no longer available. Please refresh your wallet and try again.');
            } else {
                formState.setError(err.message || 'Transaction broadcast failed');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetFlow = () => {
        setShowConfirmation(false);
        setShowSuccess(false);
        setShowPreparing(false);
        setIsSubmitting(false);
        setTxId(null);
        setTransactionData(null);
        setPreparingStatus('');
        formState.setError('');
    };

    return {
        // State
        showConfirmation,
        showSuccess,
        showPreparing,
        isSubmitting,
        txId,
        transactionData,
        preparingStatus,

        // Actions
        handleSendClick,
        handleConfirmSend,
        resetFlow,

        // Manual control
        setShowConfirmation
    };
}
