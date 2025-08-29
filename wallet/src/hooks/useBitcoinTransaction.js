'use client';

import { useState } from 'react';
import BitcoinTransactionService from '@/services/bitcoin/bitcoin-transaction-service';

/**
 * Simplified Bitcoin Transaction Hook
 * Uses the dedicated BitcoinTransactionService
 */
export function useBitcoinTransaction() {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [transactionResult, setTransactionResult] = useState(null);

    const bitcoinService = new BitcoinTransactionService();

    const sendBitcoin = async (destinationAddress, amountSats, feeRate = 5) => {
        try {
            setIsLoading(true);
            setError('');
            setTransactionResult(null);

            const result = await bitcoinService.sendBitcoin(destinationAddress, amountSats, feeRate);
            
            setTransactionResult(result);
            
            return result;

        } catch (err) {
            const errorMessage = err.message || 'Transaction failed';
            setError(errorMessage);
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    const createTransaction = async (destinationAddress, amountSats, feeRate = 5) => {
        try {
            setIsLoading(true);
            setError('');
            
            const result = await bitcoinService.createAndSignTransaction(destinationAddress, amountSats, feeRate);
            
            
            return result;

        } catch (err) {
            const errorMessage = err.message || 'Transaction creation failed';
            setError(errorMessage);
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    const broadcastTransaction = async (txHex) => {
        try {
            setIsLoading(true);
            setError('');
            
            const result = await bitcoinService.broadcastTransaction(txHex);
            
            setTransactionResult(result);
            
            return result;

        } catch (err) {
            const errorMessage = err.message || 'Broadcast failed';
            setError(errorMessage);
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    const getVerifiedUtxos = async () => {
        try {
            setError('');
            
            const utxos = await bitcoinService.getVerifiedUtxos();
            
            
            return utxos;

        } catch (err) {
            const errorMessage = err.message || 'Failed to get UTXOs';
            setError(errorMessage);
            throw err;
        }
    };

    const reset = () => {
        setError('');
        setTransactionResult(null);
        setIsLoading(false);
    };

    return {
        // State
        isLoading,
        error,
        transactionResult,

        // Actions
        sendBitcoin,
        createTransaction,
        broadcastTransaction,
        getVerifiedUtxos,
        reset
    };
}

export default useBitcoinTransaction;
