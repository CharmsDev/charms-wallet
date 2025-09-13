import { useState, useCallback } from 'react';
import BitcoinTransactionOrchestrator from '@/services/bitcoin/transaction-orchestrator';
import { decodeTx } from '@/lib/bitcoin/txDecoder';
import { useUTXOs } from '@/stores/utxoStore';
import { useBlockchain } from '@/stores/blockchainStore';
import { useAddresses } from '@/stores/addressesStore';
import { useCharms } from '@/stores/charmsStore';
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
    const { charms } = useCharms();

    const handleSendClick = async () => {
        console.log('[useTransactionFlow] handleSendClick started');
        console.log('[useTransactionFlow] Form state:', {
            destinationAddress: formState.destinationAddress,
            amount: formState.amount,
            utxosCount: utxos ? Object.keys(utxos).length : 0,
            addressesCount: addresses?.length || 0
        });
        
        try {
            // Validation with detailed logging
            if (!formState.destinationAddress || !formState.amount) {
                const error = 'Please fill in destination address and amount.';
                console.error('[useTransactionFlow] Validation failed:', error);
                formState.setError(error);
                return;
            }

            const amountInSats = parseInt(formState.amount, 10);
            if (isNaN(amountInSats) || amountInSats < 547) {
                const error = 'The minimum amount to send is 547 satoshis.';
                console.error('[useTransactionFlow] Amount validation failed:', { amountInSats, error });
                formState.setError(error);
                return;
            }

            // Check UTXOs availability
            if (!utxos || Object.keys(utxos).length === 0) {
                const error = 'No UTXOs available. Please refresh your wallet.';
                console.error('[useTransactionFlow] UTXO check failed:', { utxos, error });
                formState.setError(error);
                return;
            }

            // Check addresses loaded
            if (!addresses || addresses.length === 0) {
                const error = 'Wallet addresses not loaded. Please refresh your wallet.';
                console.error('[useTransactionFlow] Address check failed:', { addresses, error });
                formState.setError(error);
                return;
            }

            console.log('[useTransactionFlow] All validations passed, proceeding with transaction preparation');

            formState.setError('');
            setShowPreparing(true);
            setPreparingStatus('Selecting UTXOs and calculating fees...');
            console.log('[useTransactionFlow] Starting transaction preparation');
            
            // Use the same UTXO filtering logic as the Max button calculation
            const { utxoCalculations } = await import('@/services/utxo/utils/calculations');
            const spendableUtxos = utxoCalculations.getSpendableUtxos(utxos, charms);
            const allUtxos = Object.values(spendableUtxos).flat().map(utxo => {
                // Find the address for this UTXO from the original utxos map
                for (const [address, addressUtxos] of Object.entries(utxos)) {
                    if (addressUtxos.some(u => u.txid === utxo.txid && u.vout === utxo.vout)) {
                        return { ...utxo, address };
                    }
                }
                return utxo;
            });
            
            console.log('[useTransactionFlow] Spendable UTXOs (excluding charms):', allUtxos.length);
            console.log('[useTransactionFlow] Total spendable value:', allUtxos.reduce((sum, utxo) => sum + utxo.value, 0), 'sats');
            
            if (allUtxos.length === 0) {
                const error = 'No spendable UTXOs available. All UTXOs are either charms or reserved (1000 sats).';
                console.error('[useTransactionFlow] No spendable UTXOs found');
                setShowPreparing(false);
                formState.setError(error);
                return;
            }

            // Precalculate UTXO selection, fees, and change
            
            // Import UTXO selector for preselection
            const { UTXOSelector } = await import('@/services/utxo/core/selector');
            const selector = new UTXOSelector();
            
            // Get network fee rate
            console.log('[useTransactionFlow] Fetching fee estimates for network:', activeNetwork);
            const { bitcoinApiRouter } = await import('@/services/shared/bitcoin-api-router');
            const feeEstimates = await bitcoinApiRouter.getFeeEstimates(activeNetwork);
            
            if (!feeEstimates.success) {
                const error = 'Failed to fetch network fee estimates. Please try again.';
                console.error('[useTransactionFlow] Fee estimate failed:', feeEstimates.error);
                setShowPreparing(false);
                formState.setError(error);
                return;
            }
            
            const currentFeeRate = feeEstimates.fees.halfHour;
            console.log('[useTransactionFlow] Using fee rate:', currentFeeRate, 'sat/vB');

            // Detect if this is a Max amount transaction
            const totalAvailable = allUtxos.reduce((sum, utxo) => sum + utxo.value, 0);
            const isMaxTransaction = amountInSats >= (totalAvailable - 1000); // Within 1000 sats of total
            
            console.log('[useTransactionFlow] Transaction type detection:', {
                amountInSats,
                totalAvailable,
                isMaxTransaction,
                difference: totalAvailable - amountInSats
            });
            
            let selectionResult;
            
            if (isMaxTransaction) {
                // For Max transactions: use ALL UTXOs, calculate exact fee for 1 output
                const exactFee = selector.calculateMixedFee(allUtxos, 1, currentFeeRate);
                const minFee = Math.max(exactFee, 200);
                const adjustedAmount = totalAvailable - minFee;
                
                selectionResult = {
                    selectedUtxos: allUtxos,
                    totalSelected: totalAvailable,
                    estimatedFee: minFee,
                    change: 0,
                    adjustedAmount
                };
                
                console.log('[useTransactionFlow] Max transaction - using all UTXOs:', {
                    selectedCount: allUtxos.length,
                    totalSelected: totalAvailable,
                    exactFee,
                    minFee,
                    adjustedAmount,
                    change: 0
                });
            } else {
                // For regular transactions: use dynamic selection
                selectionResult = await selector.selectUtxosForAmountDynamic(
                    allUtxos,
                    amountInSats,
                    currentFeeRate,
                    null,
                    updateAfterTransaction,
                    'bitcoin',
                    activeNetwork
                );
                
                console.log('[useTransactionFlow] Regular transaction - UTXO selection result:', {
                    selectedCount: selectionResult.selectedUtxos?.length || 0,
                    totalSelected: selectionResult.totalSelected,
                    estimatedFee: selectionResult.estimatedFee,
                    change: selectionResult.change,
                    adjustedAmount: selectionResult.adjustedAmount
                });
            }
            
            if (!selectionResult.selectedUtxos || selectionResult.selectedUtxos.length === 0) {
                const error = 'Unable to select sufficient UTXOs for this transaction. Please try a smaller amount.';
                console.error('[useTransactionFlow] UTXO selection failed:', selectionResult);
                setShowPreparing(false);
                formState.setError(error);
                return;
            }
            // Create transaction and get decoded data
            console.log('[useTransactionFlow] Creating transaction with orchestrator');
            const orchestrator = new BitcoinTransactionOrchestrator(activeNetwork);
            
            const result = await orchestrator.processTransaction(
                formState.destinationAddress,
                selectionResult.adjustedAmount || amountInSats,
                selectionResult.selectedUtxos,
                currentFeeRate,
                updateAfterTransaction
            );

            console.log('[useTransactionFlow] Transaction creation result:', {
                success: result.success,
                error: result.error,
                hasTxHex: !!result.signedTxHex
            });

            if (!result.success) {
                console.error('[useTransactionFlow] Transaction creation failed:', result.error);
                throw new Error(result.error);
            }

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
            console.log('[useTransactionFlow] Transaction prepared successfully, showing confirmation dialog');

        } catch (err) {
            console.error('[useTransactionFlow] Transaction preparation failed:', err);
            console.error('[useTransactionFlow] Error stack:', err.stack);
            setShowPreparing(false);
            const errorMessage = err.message || 'Transaction preparation failed';
            console.error('[useTransactionFlow] Setting error message:', errorMessage);
            formState.setError(errorMessage);
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
