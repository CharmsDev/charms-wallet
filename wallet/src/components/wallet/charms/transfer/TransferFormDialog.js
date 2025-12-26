'use client';

import { useState, useEffect, useMemo } from 'react';
import { useCharms } from '@/stores/charmsStore';
import { charmUtxoSelector } from '@/services/charms/utils/charm-utxo-selector';

/**
 * Step 1: Transfer Form
 * - Destination address input
 * - Amount input (for tokens only)
 * - Auto-detects NFT vs Token
 */
export default function TransferFormDialog({ charm, onNext, onClose }) {
    const [destinationAddress, setDestinationAddress] = useState('');
    const [transferAmount, setTransferAmount] = useState('');
    const { isCharmNFT, isCharmToken } = useCharms();

    const isNFT = isCharmNFT(charm);
    const isToken = isCharmToken(charm);

    const ticker = charm.ticker || charm.metadata?.ticker || '';
    const decimals = charm.decimals || 8;

    // [RJJ-16] - Temporary 16 UTXO limitation: Calculate max transferable amount
    const allCharmUtxos = charm.allUtxos || [charm];
    const maxTransferInfo = useMemo(() => {
        if (isNFT) {
            return { maxAmount: 1, isLimited: false, totalBalance: 1, utxoCount: 1, maxUtxos: 16 };
        }
        
        const result = charmUtxoSelector.getMaxTransferableAmount(allCharmUtxos, charm.appId);
        const divisor = Math.pow(10, decimals);
        
        return {
            maxAmount: result.maxAmount / divisor,
            totalBalance: result.totalBalance / divisor,
            isLimited: result.isLimited,
            utxoCount: result.utxoCount,
            maxUtxos: result.maxUtxos
        };
    }, [allCharmUtxos, charm.appId, isNFT, decimals]);

    const maxAmount = maxTransferInfo.maxAmount;

    // Form validation
    const isAddressValid = destinationAddress.trim().length > 0;
    const isAmountValid = isNFT || (transferAmount && parseFloat(transferAmount) > 0 && parseFloat(transferAmount) <= parseFloat(maxAmount));
    const isFormValid = isAddressValid && isAmountValid;

    // Handle form submission
    const handleNext = () => {
        if (!isFormValid) return;

        const amountInSmallestUnits = isNFT 
            ? (charm.amount || 1)
            : Math.floor(parseFloat(transferAmount) * Math.pow(10, decimals));

        onNext({
            destinationAddress: destinationAddress.trim(),
            transferAmount: amountInSmallestUnits,
            displayAmount: isNFT ? '1' : transferAmount
        });
    };

    // Set default amount for NFTs
    useEffect(() => {
        if (isNFT) {
            setTransferAmount('1');
        }
    }, [isNFT]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="card w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="bg-primary-600 text-white px-6 py-4 flex justify-between items-center">
                    <h3 className="text-lg font-bold">
                        Transfer {isNFT ? 'NFT' : 'Tokens'}
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-white hover:text-gray-200"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-grow space-y-6">
                    {/* Charm Info */}
                    <div className="glass-effect p-4 rounded-xl">
                        <div className="flex justify-between items-center mb-3">
                            <h4 className="font-bold text-white">Charm Details</h4>
                            {isNFT ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-900/30 text-primary-400">
                                    NFT
                                </span>
                            ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-bitcoin-900/30 text-bitcoin-400">
                                    Token
                                </span>
                            )}
                        </div>
                        <div className="space-y-3 text-sm">
                            {/* Name and Available in same row */}
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="text-dark-400 text-xs mb-1">Name:</p>
                                    <p className="font-medium text-white">
                                        {charm.name || charm.metadata?.name || 'Unknown'}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-dark-400 text-xs mb-1">Available:</p>
                                    <p className="font-bold text-bitcoin-400">
                                        {maxAmount} {ticker}
                                    </p>
                                </div>
                            </div>
                            {/* App ID full width */}
                            <div>
                                <p className="text-dark-400 text-xs mb-1">App ID:</p>
                                <p className="font-medium font-mono text-white text-xs break-all">
                                    {charm.appId}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Transfer Form */}
                    <div className="space-y-4">
                        <h4 className="font-bold gradient-text">Transfer Details</h4>

                        {/* Destination Address */}
                        <div>
                            <label htmlFor="destination-address" className="block text-sm font-medium text-dark-200 mb-1">
                                Destination Address *
                            </label>
                            <input
                                type="text"
                                id="destination-address"
                                value={destinationAddress}
                                onChange={(e) => setDestinationAddress(e.target.value)}
                                placeholder="Enter Bitcoin address (bc1... or tb1...)"
                                className="w-full px-3 py-2 bg-dark-700 border border-dark-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                            />
                        </div>

                        {/* Amount (Tokens only) */}
                        {isToken && (
                            <div>
                                <label htmlFor="transfer-amount" className="block text-sm font-medium text-dark-200 mb-1">
                                    Amount to Transfer *
                                </label>
                                <div className="flex items-center gap-3">
                                    {/* Input container with ticker inside - 50% width */}
                                    <div className="relative flex-1 max-w-[50%]">
                                        <input
                                            type="number"
                                            id="transfer-amount"
                                            value={transferAmount}
                                            onChange={(e) => setTransferAmount(e.target.value)}
                                            min="0"
                                            max={maxAmount}
                                            step="0.00000001"
                                            placeholder="0.00"
                                            className="w-full pl-3 pr-20 py-2 bg-dark-700 border border-dark-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        />
                                        <div className="absolute right-0 top-0 h-full flex items-center pr-3 pointer-events-none">
                                            <div className="border-l border-dark-500 h-6 mr-3"></div>
                                            <span className="text-bitcoin-400 font-medium text-sm">
                                                {ticker}
                                            </span>
                                        </div>
                                    </div>
                                    {/* Max button */}
                                    <button
                                        onClick={() => setTransferAmount(maxAmount.toString())}
                                        className="px-4 py-2 text-sm bg-dark-700 hover:bg-dark-600 text-white rounded-lg border border-dark-600 transition-colors"
                                    >
                                        Max
                                    </button>
                                </div>
                                {/* [RJJ-16] - Temporary: Show UTXO limitation warning */}
                                <p className="mt-2 text-xs text-dark-400">
                                    {maxTransferInfo.isLimited ? (
                                        <>
                                            Max per transfer: {maxAmount} {ticker} ({maxTransferInfo.maxUtxos} UTXOs)
                                            <br />
                                            <span className="text-orange-400">
                                                Total balance: {maxTransferInfo.totalBalance} {ticker} (requires multiple transfers)
                                            </span>
                                        </>
                                    ) : (
                                        <>Available: {maxAmount} {ticker}</>
                                    )}
                                </p>
                            </div>
                        )}

                        {/* NFT Notice */}
                        {isNFT && (
                            <div className="bg-blue-900/20 p-4 rounded-lg border border-blue-800/50">
                                <p className="text-sm text-blue-300">
                                    NFTs are transferred in their entirety. The complete NFT will be sent to the destination address.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="bg-dark-800 px-6 py-4 flex justify-between">
                    <button
                        onClick={onClose}
                        className="btn btn-secondary"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleNext}
                        disabled={!isFormValid}
                        className={`btn ${!isFormValid
                            ? 'bg-dark-600 cursor-not-allowed text-dark-400'
                            : 'btn-primary'
                            }`}
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
}
