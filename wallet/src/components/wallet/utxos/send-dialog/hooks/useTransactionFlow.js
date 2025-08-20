import { useState, useCallback } from 'react';
import BitcoinTransactionOrchestrator from '@/services/bitcoin/transaction-orchestrator';
import { decodeTx } from '@/lib/bitcoin/txDecoder';
import { useUTXOs } from '@/stores/utxoStore';
import { useBlockchain } from '@/stores/blockchainStore';
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

    const handleSendClick = async () => {
        try {
            if (!formState.destinationAddress || !formState.amount) {
                formState.setError('Please fill in destination address and amount.');
                return;
            }

            formState.setError('');
            
            const allUtxos = utxos ? Object.entries(utxos).flatMap(([address, addressUtxos]) =>
                addressUtxos.map(utxo => ({ ...utxo, address }))
            ) : [];

            if (allUtxos.length === 0) {
                formState.setError('No UTXOs available. Please refresh your wallet.');
                return;
            }

            setPreparingStatus('Creating transaction...');
            setShowPreparing(true);

            const orchestrator = new BitcoinTransactionOrchestrator(activeNetwork);
            const result = await orchestrator.processTransaction(
                formState.destinationAddress,
                formState.amount,
                allUtxos,
                formState.feeRate,
                updateAfterTransaction
            );

            if (!result.success) throw new Error(result.error);

            setTransactionData({
                txHex: result.signedTxHex,
                decodedTx: decodeTx(result.signedTxHex, activeNetwork),
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

            const orchestrator = new BitcoinTransactionOrchestrator(activeNetwork);
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
