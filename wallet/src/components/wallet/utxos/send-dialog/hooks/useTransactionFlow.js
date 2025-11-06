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
        
        try {
            // Validation with detailed logging
            if (!formState.destinationAddress || !formState.amount) {
                const error = 'Please fill in destination address and amount.';
                formState.setError(error);
                return;
            }

            const amountInSats = parseInt(formState.amount, 10);
            if (isNaN(amountInSats) || amountInSats < 547) {
                const error = 'The minimum amount to send is 547 satoshis.';
                formState.setError(error);
                return;
            }

            // Check UTXOs availability
            if (!utxos || Object.keys(utxos).length === 0) {
                const error = 'No UTXOs available. Please refresh your wallet.';
                formState.setError(error);
                return;
            }

            // Check addresses loaded
            if (!addresses || addresses.length === 0) {
                const error = 'Wallet addresses not loaded. Please refresh your wallet.';
                formState.setError(error);
                return;
            }


            formState.setError('');
            setShowPreparing(true);
            setPreparingStatus('Selecting UTXOs and calculating fees...');
            
            // Use the same UTXO filtering logic as the Max button calculation
            const { utxoCalculations } = await import('@/services/utxo/utils/calculations');
            const spendableUtxos = utxoCalculations.getSpendableUtxos(utxos, charms);
            const allUtxos = Object.entries(spendableUtxos).flatMap(([address, addressUtxos]) => 
                addressUtxos.map(utxo => ({ ...utxo, address }))
            );
            
            console.log('💰 [SendBitcoin] Total UTXOs:', Object.values(utxos).flat().length);
            console.log('💰 [SendBitcoin] Spendable UTXOs (after filtering):', allUtxos.length);
            console.log('💰 [SendBitcoin] Protected charms:', charms.length);
            
            if (allUtxos.length === 0) {
                const error = 'No spendable UTXOs available. All UTXOs are either charms or reserved (1000 sats).';
                setShowPreparing(false);
                formState.setError(error);
                return;
            }

            // Precalculate UTXO selection, fees, and change
            
            // Import UTXO selector for preselection
            const { UTXOSelector } = await import('@/services/utxo/core/selector');
            const selector = new UTXOSelector();
            
            // Get network fee rate
            const { bitcoinApiRouter } = await import('@/services/shared/bitcoin-api-router');
            const feeEstimates = await bitcoinApiRouter.getFeeEstimates(activeNetwork);
            
            if (!feeEstimates.success) {
                const error = 'Failed to fetch network fee estimates. Please try again.';
                setShowPreparing(false);
                formState.setError(error);
                return;
            }
            
            const currentFeeRate = feeEstimates.fees.halfHour;

            // Detect if this is a Max amount transaction
            const totalAvailable = allUtxos.reduce((sum, utxo) => sum + utxo.value, 0);
            const isMaxTransaction = amountInSats >= (totalAvailable - 1000); // Within 1000 sats of total
            
            
            let selectionResult;
            
            if (isMaxTransaction) {
                // For Max transactions: use ALL UTXOs, calculate exact fee for 1 output
                const exactFee = selector.calculateMixedFee(allUtxos, 1, currentFeeRate);
                const adjustedAmount = totalAvailable - exactFee;
                
                selectionResult = {
                    selectedUtxos: allUtxos,
                    totalSelected: totalAvailable,
                    estimatedFee: exactFee,
                    change: 0,
                    adjustedAmount,
                    feeRate: currentFeeRate
                };
                
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
                
                // Add fee rate to result
                selectionResult.feeRate = currentFeeRate;
            }
            
            if (!selectionResult.selectedUtxos || selectionResult.selectedUtxos.length === 0) {
                const error = 'Unable to select sufficient UTXOs for this transaction. Please try a smaller amount.';
                setShowPreparing(false);
                formState.setError(error);
                return;
            }
            // Create transaction and get decoded data
            const orchestrator = new BitcoinTransactionOrchestrator(activeNetwork);
            
            const result = await orchestrator.processTransaction(
                formState.destinationAddress,
                selectionResult.adjustedAmount || amountInSats,
                selectionResult.selectedUtxos,
                currentFeeRate,
                updateAfterTransaction
            );


            if (!result.success) {
                throw new Error(result.error);
            }

            // Store precalculated data with decoded transaction
            const precalculatedData = {
                selectedUtxos: selectionResult.selectedUtxos,
                totalSelected: selectionResult.totalSelected,
                estimatedFee: selectionResult.estimatedFee,
                change: selectionResult.change,
                adjustedAmount: selectionResult.adjustedAmount || amountInSats,
                feeRate: selectionResult.feeRate,
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
            const errorMessage = err.message || 'Transaction preparation failed';
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
                // Remove spent UTXOs from storage (spent outside this wallet)
                const spentUtxosList = spentUtxos.map(s => {
                    const [txid, vout] = s.utxo.split(':');
                    return { txid, vout: parseInt(vout) };
                });
                await updateAfterTransaction(spentUtxosList, {}, 'bitcoin', activeNetwork);
                
                throw new Error(`${spentUtxos.length} UTXO(s) were already spent. They have been removed from your wallet.`);
            }

            if (failedVerifications.length > 0) {
            }

            const orchestrator = new BitcoinTransactionOrchestrator(activeNetwork);
            
            // Broadcast pre-created transaction
            const broadcastResult = await orchestrator.broadcastService.broadcastTransaction(transactionData.txHex, activeNetwork);
            
            if (!broadcastResult.success) {
                throw new Error(broadcastResult.error || 'Failed to broadcast transaction');
            }

            // Remove spent UTXOs from storage immediately after successful broadcast
            await updateAfterTransaction(transactionData.selectedUtxos, {}, 'bitcoin', activeNetwork);

            setTxId(broadcastResult.txid);
            setShowConfirmation(false);
            setShowSuccess(true);

        } catch (err) {
            setShowPreparing(false);
            
            if (err.message.includes('bad-txns-inputs-missingorspent')) {
                // UTXOs were spent between verification and broadcast - remove them
                if (transactionData?.selectedUtxos) {
                    await updateAfterTransaction(transactionData.selectedUtxos, {}, 'bitcoin', activeNetwork);
                }
                formState.setError('The UTXOs were spent by another transaction. They have been removed from your wallet.');
            } else if (err.message.includes('already spent')) {
                // Already handled and removed during verification
                formState.setError(err.message);
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
