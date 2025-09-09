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
            console.log('[TransactionFlow] Send clicked:', {
                destinationAddress: formState.destinationAddress?.length,
                amount: formState.amount,
                utxosAvailable: utxos ? Object.keys(utxos).length : 0,
                addressesLoaded: addresses?.length || 0
            });

            if (!formState.destinationAddress || !formState.amount) {
                console.warn('[TransactionFlow] Missing required fields');
                formState.setError('Please fill in destination address and amount.');
                return;
            }

            const amountInSats = parseInt(formState.amount, 10);
            if (isNaN(amountInSats) || amountInSats < 547) {
                console.warn('[TransactionFlow] Invalid amount:', amountInSats);
                formState.setError('The minimum amount to send is 547 satoshis.');
                return;
            }

            // Verificar que tenemos UTXOs disponibles
            if (!utxos || Object.keys(utxos).length === 0) {
                console.error('[TransactionFlow] No UTXOs available');
                formState.setError('No UTXOs available. Please refresh your wallet.');
                return;
            }

            // Verificar que tenemos direcciones cargadas
            if (!addresses || addresses.length === 0) {
                console.error('[TransactionFlow] No addresses loaded');
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

            // PRECALCULATE EVERYTHING HERE - UTXO selection, fees, change
            
            // Import the UTXO selector directly for preselection
            const { UTXOSelector } = await import('@/services/utxo/core/selector');
            const selector = new UTXOSelector();
            
            // Get current network fee rate
            const { bitcoinApiRouter } = await import('@/services/shared/bitcoin-api-router');
            const feeEstimates = await bitcoinApiRouter.getFeeEstimates(activeNetwork);
            const currentFeeRate = feeEstimates.fees.halfHour; // Use 30-min confirmation fee
            
            
            if (!feeEstimates.success) {
            }

            // Pre-select UTXOs and calculate exact fees
            const selectionResult = await selector.selectUtxosForAmountDynamic(
                allUtxos,
                amountInSats,
                currentFeeRate, // Use dynamic fee rate
                null, // verifier
                updateAfterTransaction,
                'bitcoin',
                activeNetwork
            );
            
            
            // Create the actual transaction to get decoded data
            
            const orchestrator = new BitcoinTransactionOrchestrator(activeNetwork);
            const result = await orchestrator.processTransaction(
                formState.destinationAddress,
                selectionResult.adjustedAmount || amountInSats,
                selectionResult.selectedUtxos,
                currentFeeRate, // Use dynamic fee rate
                updateAfterTransaction
            );

            if (!result.success) throw new Error(result.error);

            // Store the precalculated data with decoded transaction
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

            // Use the precalculated transaction data instead of recalculating
            if (!transactionData) {
                throw new Error('No precalculated transaction data available');
            }

            console.log('[TransactionFlow] Starting broadcast verification:', {
                selectedUtxos: transactionData.selectedUtxos?.length,
                txHex: transactionData.txHex?.length,
                estimatedFee: transactionData.estimatedFee
            });

            // CRITICAL: Verify UTXOs are still available before broadcast
            console.log('[TransactionFlow] Verifying UTXOs before broadcast...');
            const { bitcoinApiRouter } = await import('@/services/shared/bitcoin-api-router');
            
            // Quick verification of each UTXO
            const utxoVerifications = await Promise.allSettled(
                transactionData.selectedUtxos.map(async (utxo) => {
                    try {
                        const isSpent = await bitcoinApiRouter.isUtxoSpent(utxo.txid, utxo.vout, activeNetwork);
                        return { utxo: `${utxo.txid}:${utxo.vout}`, isSpent, value: utxo.value };
                    } catch (error) {
                        console.warn(`[TransactionFlow] Failed to verify UTXO ${utxo.txid}:${utxo.vout}:`, error.message);
                        return { utxo: `${utxo.txid}:${utxo.vout}`, isSpent: false, error: error.message };
                    }
                })
            );

            // Check for spent UTXOs
            const spentUtxos = utxoVerifications
                .filter(result => result.status === 'fulfilled' && result.value.isSpent)
                .map(result => result.value);

            const failedVerifications = utxoVerifications
                .filter(result => result.status === 'rejected' || result.value.error)
                .map(result => result.status === 'fulfilled' ? result.value : { error: result.reason });

            console.log('[TransactionFlow] UTXO verification results:', {
                total: transactionData.selectedUtxos.length,
                spent: spentUtxos.length,
                failed: failedVerifications.length,
                spentUtxos,
                failedVerifications
            });

            if (spentUtxos.length > 0) {
                console.error('[TransactionFlow] Found spent UTXOs:', spentUtxos);
                throw new Error(`${spentUtxos.length} UTXO(s) were spent by another transaction. Please refresh your wallet and try again.`);
            }

            if (failedVerifications.length > 0) {
                console.warn('[TransactionFlow] Some UTXO verifications failed, proceeding with broadcast...');
            }

            const orchestrator = new BitcoinTransactionOrchestrator(activeNetwork);
            
            // Use the pre-created transaction hex for broadcast (no need to recreate)
            const broadcastResult = await orchestrator.broadcastService.broadcastTransaction(transactionData.txHex);
            
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
