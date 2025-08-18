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

            console.log('[useBitcoinTransaction] Starting Bitcoin transaction...');
            console.log(`[useBitcoinTransaction] Destination: ${destinationAddress}`);
            console.log(`[useBitcoinTransaction] Amount: ${amountSats} sats`);
            console.log(`[useBitcoinTransaction] Fee rate: ${feeRate} sats/byte`);

            const result = await bitcoinService.sendBitcoin(destinationAddress, amountSats, feeRate);
            
            setTransactionResult(result);
            console.log('[useBitcoinTransaction] ✅ Transaction completed successfully');
            
            return result;

        } catch (err) {
            const errorMessage = err.message || 'Transaction failed';
            setError(errorMessage);
            console.error('[useBitcoinTransaction] ❌ Transaction failed:', errorMessage);
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    const createTransaction = async (destinationAddress, amountSats, feeRate = 5) => {
        try {
            setIsLoading(true);
            setError('');

            console.log('[useBitcoinTransaction] Creating Bitcoin transaction...');
            
            const result = await bitcoinService.createAndSignTransaction(destinationAddress, amountSats, feeRate);
            
            console.log('[useBitcoinTransaction] ✅ Transaction created successfully');
            
            return result;

        } catch (err) {
            const errorMessage = err.message || 'Transaction creation failed';
            setError(errorMessage);
            console.error('[useBitcoinTransaction] ❌ Transaction creation failed:', errorMessage);
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    const broadcastTransaction = async (txHex) => {
        try {
            setIsLoading(true);
            setError('');

            console.log('[useBitcoinTransaction] Broadcasting transaction...');
            
            const result = await bitcoinService.broadcastTransaction(txHex);
            
            setTransactionResult(result);
            console.log('[useBitcoinTransaction] ✅ Transaction broadcast successfully');
            
            return result;

        } catch (err) {
            const errorMessage = err.message || 'Broadcast failed';
            setError(errorMessage);
            console.error('[useBitcoinTransaction] ❌ Broadcast failed:', errorMessage);
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    const getVerifiedUtxos = async () => {
        try {
            setError('');
            console.log('[useBitcoinTransaction] Getting verified UTXOs...');
            
            const utxos = await bitcoinService.getVerifiedUtxos();
            
            console.log(`[useBitcoinTransaction] ✅ Retrieved ${utxos.length} verified UTXOs`);
            
            return utxos;

        } catch (err) {
            const errorMessage = err.message || 'Failed to get UTXOs';
            setError(errorMessage);
            console.error('[useBitcoinTransaction] ❌ Failed to get UTXOs:', errorMessage);
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
