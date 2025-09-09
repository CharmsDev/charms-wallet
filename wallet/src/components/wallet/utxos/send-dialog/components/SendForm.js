import { useState } from 'react';
import { SATOSHI_AMOUNTS } from '../utils/amountUtils';
import { useUTXOs } from '@/stores/utxoStore';
import { useBlockchain } from '@/stores/blockchainStore';
import { useCharms } from '@/stores/charmsStore';
import { useAddresses } from '@/stores/addressesStore';
import { utxoCalculations } from '@/services/utxo/utils/calculations';

export default function SendForm({ formState, onSend, onCancel }) {
    const {
        destinationAddress,
        setDestinationAddress,
        amount,
        setAmount,
        error,
    } = formState;

    const { utxos } = useUTXOs();
    const { activeBlockchain, activeNetwork } = useBlockchain();
    const { charms } = useCharms();
    const { addresses } = useAddresses();

    // Validation states
    const [showValidationErrors, setShowValidationErrors] = useState(false);
    const [isCalculatingMax, setIsCalculatingMax] = useState(false);
    const isAddressValid = destinationAddress && destinationAddress.trim().length > 0;
    const amountNum = parseInt(amount) || 0;
    const isAmountValid = amountNum >= 546;
    const canSubmit = isAddressValid && isAmountValid;

    const handleMaxAmount = async () => {
        setIsCalculatingMax(true);
        
        try {
            // Get current fee estimates from network
            const { bitcoinApiRouter } = await import('@/services/shared/bitcoin-api-router');
            const feeEstimates = await bitcoinApiRouter.getFeeEstimates(activeNetwork);
            const currentFeeRate = feeEstimates.fees.halfHour; // Use 30-min confirmation fee
            
            
            if (!feeEstimates.success) {
            }
            
            // Get spendable UTXOs using the same logic as the selector
            const spendableUtxos = utxoCalculations.getSpendableUtxos(utxos, charms);
            
            if (Object.keys(spendableUtxos).length === 0) {
                setAmount('0');
                return;
            }

            // Use UTXOSelector for optimal UTXO selection
            const { UTXOSelector } = await import('@/services/utxo/core/selector');
            const selector = new UTXOSelector();
            const allUtxos = Object.values(spendableUtxos).flat();
            
            // Sort UTXOs by value (largest first) for optimal selection
            const sortedUtxos = [...allUtxos].sort((a, b) => b.value - a.value);
            
            // Try to find the optimal number of UTXOs that maximizes the amount after fees
            let bestMaxAmount = 0;
            let bestUtxoCount = 1;
            
            for (let utxoCount = 1; utxoCount <= sortedUtxos.length; utxoCount++) {
                const selectedUtxos = sortedUtxos.slice(0, utxoCount);
                const totalValue = selectedUtxos.reduce((sum, utxo) => sum + utxo.value, 0);
                const feeForThisSelection = selector.calculateMixedFee(selectedUtxos, 1, currentFeeRate);
                const maxAmountForThisSelection = Math.max(0, totalValue - feeForThisSelection);
                
                if (maxAmountForThisSelection > bestMaxAmount) {
                    bestMaxAmount = maxAmountForThisSelection;
                    bestUtxoCount = utxoCount;
                }
            }
            
            
            const maxAmount = bestMaxAmount;
            
            setAmount(maxAmount.toString());
            
        } catch (error) {
            setAmount('0');
        } finally {
            setIsCalculatingMax(false);
        }
    };

    const handleSend = () => {
        // Debug logging para identificar problemas
        console.log('[SendForm] Button clicked:', {
            canSubmit,
            isAddressValid,
            isAmountValid,
            destinationAddress: destinationAddress?.length,
            amount,
            utxosCount: utxos ? Object.keys(utxos).length : 0,
            addressesCount: addresses?.length || 0
        });

        if (canSubmit) {
            setShowValidationErrors(false);
            onSend();
        } else {
            setShowValidationErrors(true);
            console.warn('[SendForm] Validation failed:', {
                isAddressValid,
                isAmountValid,
                destinationAddress,
                amount
            });
        }
    };

    return (
        <>
            <h2 className="text-xl font-bold gradient-text mb-4">Send Bitcoin</h2>

            <div className="mb-4">
                <label className="block text-sm font-medium text-dark-200 mb-2">
                    Destination Address
                </label>
                <input
                    type="text"
                    value={destinationAddress}
                    onChange={(e) => setDestinationAddress(e.target.value)}
                    className={`w-full px-4 py-3 bg-dark-800 border rounded-lg text-dark-100 placeholder-dark-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all duration-200 ${
                        showValidationErrors && !isAddressValid 
                            ? 'border-red-500 focus:ring-red-400' 
                            : 'border-dark-600 focus:ring-bitcoin-400'
                    }`}
                    placeholder="Enter Bitcoin address"
                />
            </div>

            <div className="mb-4">
                <label className="block text-sm font-medium text-dark-200 mb-2">
                    Amount (Satoshis)
                </label>
                <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className={`w-full px-4 py-3 bg-dark-800 border rounded-lg text-dark-100 placeholder-dark-400 focus:outline-none focus:ring-2 focus:border-transparent transition-all duration-200 ${
                        showValidationErrors && !isAmountValid 
                            ? 'border-red-500 focus:ring-red-400' 
                            : 'border-dark-600 focus:ring-bitcoin-400'
                    }`}
                    placeholder="Enter amount in satoshis (min: 546)"
                />
                <div className="mt-3 grid grid-cols-3 gap-2">
                    {SATOSHI_AMOUNTS.map((satAmount) => (
                        <button
                            key={satAmount}
                            type="button"
                            onClick={() => setAmount(satAmount.toString())}
                            className="px-3 py-2 bg-dark-700 hover:bg-dark-600 border border-dark-600 rounded-lg text-dark-200 text-sm transition-colors"
                        >
                            {satAmount.toLocaleString()}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={handleMaxAmount}
                        disabled={isCalculatingMax}
                        className={`px-3 py-2 border rounded-lg text-sm font-medium transition-colors flex items-center justify-center min-w-[60px] ${
                            isCalculatingMax
                                ? 'bg-bitcoin-700 border-bitcoin-600 text-bitcoin-200 cursor-not-allowed'
                                : 'bg-bitcoin-600 hover:bg-bitcoin-500 border-bitcoin-500 text-white'
                        }`}
                    >
                        {isCalculatingMax ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            'Max'
                        )}
                    </button>
                </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-6 py-3 bg-dark-700 hover:bg-dark-600 border border-dark-600 rounded-lg text-dark-200 font-medium transition-colors"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={handleSend}
                    disabled={!canSubmit}
                    className={`px-6 py-3 border rounded-lg font-medium transition-colors ${
                        canSubmit
                            ? 'bg-bitcoin-600 hover:bg-bitcoin-500 border-bitcoin-500 text-white'
                            : 'bg-dark-600 border-dark-500 text-dark-400 cursor-not-allowed'
                    }`}
                >
                    Send Now
                </button>
            </div>
            
        </>
    );
}
