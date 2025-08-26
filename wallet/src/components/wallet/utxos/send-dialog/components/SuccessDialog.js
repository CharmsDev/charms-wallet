import { useState, useEffect } from 'react';
import { useAddresses } from '@/stores/addressesStore';
import { useBlockchain } from '@/stores/blockchainStore';
import { useUTXOs } from '@/stores/utxoStore';
import { useTransactions } from '@/stores/transactionStore';
import { refreshTransactionAddresses } from '@/services/utxo/address-refresh-helper';
import { formatSatoshis, parseAmount } from '../utils/amountUtils';

export function SuccessDialog({
    txId,
    amount,
    destinationAddress,
    transactionData,
    feeRate,
    onClose
}) {
    const { loadUTXOs } = useUTXOs();
    const { activeBlockchain, activeNetwork } = useBlockchain();
    const { loadTransactions } = useTransactions();

    // Refresh specific addresses after transaction success
    useEffect(() => {
        const refreshAfterTransaction = async () => {
            try {
                console.log('[SUCCESS DIALOG] Refreshing after transaction:', txId);
                
                // Refresh change address and destination address (if ours)
                await refreshTransactionAddresses(
                    transactionData,
                    destinationAddress,
                    activeBlockchain,
                    activeNetwork
                );

                // Reload UTXOs in store to update UI
                await loadUTXOs(activeBlockchain, activeNetwork);
                
                // Reload transactions to show the sent transaction immediately
                await loadTransactions(activeBlockchain, activeNetwork);
                
                console.log('[SUCCESS DIALOG] Successfully refreshed UTXOs and transactions');
            } catch (error) {
                console.error('[SUCCESS DIALOG] Error refreshing addresses:', error);
            }
        };

        if (txId && transactionData && destinationAddress) {
            refreshAfterTransaction();
        }
    }, [txId]); // Only depend on txId to avoid loops

    return (
        <>
            <div className="text-center mb-8">
                <div className="relative inline-flex items-center justify-center w-20 h-20 mb-6">
                    <div className="absolute inset-0 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full animate-pulse opacity-20"></div>
                    <div className="relative flex items-center justify-center w-16 h-16 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                </div>
                <h2 className="text-2xl font-bold gradient-text mb-2">Transaction Sent!</h2>
                <p className="text-dark-300">Your Bitcoin has been successfully broadcast to the network</p>
            </div>

            <div className="mb-8 p-6 bg-gradient-to-br from-dark-800 to-dark-900 rounded-xl border border-dark-600 shadow-lg">
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-dark-700">
                    <h3 className="text-lg font-semibold text-dark-100">Transaction Summary</h3>
                    <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                        <span className="text-sm text-green-400 font-medium">Broadcasted</span>
                    </div>
                </div>
                
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-6">
                        <div className="text-center p-4 bg-dark-800 rounded-lg border border-dark-700">
                            <div className="text-sm text-dark-400 mb-1">Amount Sent</div>
                            <div className="text-xl font-bold text-bitcoin-400 bitcoin-glow-text">
                                {formatSatoshis(parseAmount(amount))} sats
                            </div>
                        </div>
                        <div className="text-center p-4 bg-dark-800 rounded-lg border border-dark-700">
                            <div className="text-sm text-dark-400 mb-1">Network Fee</div>
                            <div className="text-lg font-semibold text-dark-200">
                                {transactionData?.size ? `${Math.ceil(transactionData.size * feeRate)} sats` : 'N/A'}
                            </div>
                        </div>
                    </div>

                    <div className="p-4 bg-dark-800 rounded-lg border border-dark-700">
                        <div className="text-sm text-dark-400 mb-2">Sent To</div>
                        <div className="text-dark-200 font-mono text-sm break-all bg-dark-900 p-3 rounded border border-dark-600">
                            {destinationAddress}
                        </div>
                    </div>

                    <div className="p-4 bg-dark-800 rounded-lg border border-dark-700">
                        <div className="text-sm text-dark-400 mb-2">Transaction ID</div>
                        <div className="text-dark-200 font-mono text-sm break-all bg-dark-900 p-3 rounded border border-dark-600">
                            {txId}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <a
                    href={`${activeNetwork === 'mainnet' ? 'https://mempool.space' : 'https://mempool.space/testnet4'}/tx/${txId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg transform hover:scale-105 transition-all duration-200 flex items-center justify-center space-x-2"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    <span>View on Mempool</span>
                </a>
                <button
                    className="btn btn-secondary shadow-lg transform hover:scale-105 transition-all duration-200"
                    onClick={() => {
                        // Close the entire dialog flow, not just this success screen
                        onClose();
                    }}
                >
                    Close
                </button>
            </div>
        </>
    );
}
