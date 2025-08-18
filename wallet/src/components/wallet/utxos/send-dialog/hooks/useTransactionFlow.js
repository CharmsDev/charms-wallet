import { useState } from 'react';
import BitcoinTransactionOrchestrator from '@/services/bitcoin/transaction-orchestrator';
import { decodeTx } from '@/utils/txDecoder';
import { useUTXOs } from '@/stores/utxoStore';
import config from '@/config';

export function useTransactionFlow(formState, onClose) {
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [showPreparing, setShowPreparing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [txId, setTxId] = useState(null);
    const [transactionData, setTransactionData] = useState(null);
    const [preparingStatus, setPreparingStatus] = useState('');

    // UTXO store hook for automatic state updates
    const { updateAfterTransaction, utxos } = useUTXOs();

    const handleSendClick = async () => {
        try {
            // Basic validation - only check address and amount
            if (!formState.destinationAddress || !formState.amount) {
                formState.setError('Please fill in destination address and amount.');
                return;
            }

            formState.setError('');
            console.log('[useTransactionFlow] handleSendClick called');
            console.log('[useTransactionFlow] Creating transaction for:', formState.amount, 'sats to', formState.destinationAddress);
            console.log('[useTransactionFlow] utxos from store type:', typeof utxos);
            console.log('[useTransactionFlow] utxos from store:', utxos);

            // Convert UTXO object map to flat array with address property
            const allUtxos = utxos ? Object.entries(utxos).flatMap(([address, addressUtxos]) =>
                addressUtxos.map(utxo => ({ ...utxo, address }))
            ) : [];
            console.log('[useTransactionFlow] flattened UTXOs:', allUtxos?.length, 'UTXOs');
            console.log('[useTransactionFlow] First flattened UTXO:', allUtxos?.[0]);

            if (allUtxos.length === 0) {
                formState.setError('No UTXOs available. Please refresh your wallet.');
                return;
            }

            setPreparingStatus('Creating transaction...');
            setShowPreparing(true);

            const orchestrator = new BitcoinTransactionOrchestrator();
            const result = await orchestrator.processTransaction(
                formState.destinationAddress,
                formState.amount,
                allUtxos,
                formState.feeRate,
                updateAfterTransaction
            );

            if (!result.success) {
                throw new Error(result.error);
            }

            const decodedTx = decodeTx(result.signedTxHex, config.network);

            setTransactionData({
                txHex: result.signedTxHex,
                decodedTx,
                size: result.signedTxHex.length / 2,
                selectedUtxos: result.selectedUtxos,
                totalSelected: result.totalSelected,
                estimatedFee: result.estimatedFee,
                change: result.change,
                transactionMetadata: result.transactionMetadata
            });

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

            console.log('[useTransactionFlow] Broadcasting transaction...');

            const orchestrator = new BitcoinTransactionOrchestrator();
            const result = await orchestrator.broadcastTransaction(
                transactionData.txHex,
                transactionData.selectedUtxos,
                transactionData.transactionMetadata,
                updateAfterTransaction
            );

            setTxId(result.txid);
            setShowConfirmation(false);
            setShowSuccess(true);

        } catch (err) {
            setShowPreparing(false);
            console.error('[useTransactionFlow] Broadcast failed:', err);

            // Simplified error handling
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
        // Clean up transaction state
        console.log('[useTransactionFlow] Resetting transaction flow');

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
        // Flow state
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

        // Setters for manual control
        setShowConfirmation
    };
}
