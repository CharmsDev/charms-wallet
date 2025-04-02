'use client';

import { useState, useEffect, useMemo } from 'react';
<<<<<<< HEAD

export default function SendBitcoinDialog({ isOpen, onClose, confirmedUtxos, onSend, formatSats }) {
    const [destinationAddress, setDestinationAddress] = useState('');
    const [amount, setAmount] = useState('');
=======
import { transferBitcoin, composeBitcoinTransaction, createBitcoinTransactionHex } from '@/services/wallet/transfer-bitcoin';
import { decodeTx } from '@/lib/bitcoin/txDecoder';
import config from '@/config';

export default function SendBitcoinDialog({ isOpen, onClose, confirmedUtxos, onSend, formatSats }) {
    const [destinationAddress, setDestinationAddress] = useState('bcrt1pr8wsw2dnwzyt0c9r69f42c8yu35n5sga3udf49et9220krg0a6fssaumxx');
    const [amount, setAmount] = useState('0.00005'); // 5000 satoshis
>>>>>>> feature/sign-2-txs
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [error, setError] = useState('');
    const [selectedUtxos, setSelectedUtxos] = useState([]);
    const [totalSelected, setTotalSelected] = useState(0);
<<<<<<< HEAD
=======
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [txId, setTxId] = useState(null);
    const [feeRate, setFeeRate] = useState(1); // Default fee rate in sats/byte
    const [transactionData, setTransactionData] = useState(null);
>>>>>>> feature/sign-2-txs

    // Reset selected UTXOs when amount changes
    useEffect(() => {
        if (amount && !isNaN(parseFloat(amount))) {
            const amountInSats = parseFloat(amount) * 100000000; // Convert BTC to satoshis
            const selected = selectUtxosForAmount(confirmedUtxos, amountInSats);
            setSelectedUtxos(selected.utxos);
            setTotalSelected(selected.total);
        } else {
            setSelectedUtxos([]);
            setTotalSelected(0);
        }
    }, [amount, confirmedUtxos]);

    // Function to select UTXOs for a given amount
    const selectUtxosForAmount = (utxos, amountInSats) => {
        // Sort UTXOs by value (largest first for simplicity)
        const sortedUtxos = [...utxos].sort((a, b) => b.value - a.value);

        const selectedUtxos = [];
        let totalValue = 0;

        // Simple coin selection algorithm - greedy
        // In a real implementation, you might want to use a more sophisticated algorithm
        for (const utxo of sortedUtxos) {
            if (totalValue >= amountInSats) {
                break;
            }

            selectedUtxos.push(utxo);
            totalValue += utxo.value;
        }

        return {
            utxos: selectedUtxos,
            total: totalValue
        };
    };

    // Calculate if we have enough funds
    const hasEnoughFunds = useMemo(() => {
        if (!amount || isNaN(parseFloat(amount))) return true;
        const amountInSats = parseFloat(amount) * 100000000;
        return totalSelected >= amountInSats;
    }, [amount, totalSelected]);

    const handleSendClick = async () => {
        try {
            // Basic validation
            if (!destinationAddress.trim()) {
                setError('Destination address is required');
                return;
            }

            if (!amount.trim() || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
                setError('Please enter a valid amount');
                return;
            }

            if (!hasEnoughFunds) {
                setError('Insufficient funds');
                return;
            }

            if (selectedUtxos.length === 0) {
                setError('No UTXOs selected');
                return;
            }

            // Clear any previous errors
            setError('');

            // Prepare transaction data
            const txData = {
                utxos: selectedUtxos,
                destinationAddress,
                amount: parseFloat(amount),
                feeRate,
                // The change address will be determined by the service
                // but we can provide a default from the selected UTXOs
                changeAddress: selectedUtxos[0]?.address || destinationAddress
            };

            // Compose the Bitcoin transaction object
            const bitcoinTx = await composeBitcoinTransaction(txData);

            // Create the transaction in hex format
            const txHex = await createBitcoinTransactionHex(txData);

            // Decode the transaction hex for display
            const decodedTx = decodeTx(txHex);

            // Store both the input data, composed transaction, hex, and decoded tx
            setTransactionData({
                ...txData,
                bitcoinTx,
                txHex,
                decodedTx
            });

            // Show confirmation dialog
            setShowConfirmation(true);
        } catch (err) {
            console.error('Error preparing transaction:', err);
            setError(err.message || 'Failed to prepare transaction');
        }
    };

    const handleConfirmSend = async () => {
        try {
            setIsSubmitting(true);
            setError('');

            // Send the hex transaction to the Charms API
            const apiUrl = `${config.api.wallet}/transaction/send-hex`;
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    txHex: transactionData.txHex,
                    network: config.bitcoin.network
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            // Store the transaction ID
            setTxId(result.txid);

            // Call the original onSend handler for any UI updates
            onSend({
                utxos: selectedUtxos,
                destinationAddress,
                amount: parseFloat(amount),
                txid: result.txid,
                bitcoinTx: transactionData.bitcoinTx,
                txHex: transactionData.txHex
            });

            // Reset form and close dialog
            resetAndClose();
        } catch (err) {
            console.error('Failed to send transaction:', err);
            setError(err.response?.data?.message || err.message || 'Failed to send transaction');
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetAndClose = () => {
        setDestinationAddress('bcrt1pr8wsw2dnwzyt0c9r69f42c8yu35n5sga3udf49et9220krg0a6fssaumxx');
        setAmount('0.00005');
        setShowConfirmation(false);
        setError('');
        setSelectedUtxos([]);
        setTotalSelected(0);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl">
                {!showConfirmation ? (
                    <>
                        <h2 className="text-xl font-semibold mb-4">Send Bitcoin</h2>

                        <div className="mb-4">
                            <p className="text-sm text-gray-600 mb-2">Total available: <span className="font-semibold">{formatSats(confirmedUtxos.reduce((sum, u) => sum + u.value, 0))} BTC</span></p>
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Destination Address
                            </label>
                            <input
                                type="text"
                                className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={destinationAddress}
                                onChange={(e) => setDestinationAddress(e.target.value)}
                                placeholder="Enter Bitcoin address"
                            />
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Amount (BTC)
                            </label>
                            <input
                                type="text"
                                className={`w-full p-2 border ${!hasEnoughFunds ? 'border-red-500' : 'border-gray-300'} rounded focus:outline-none focus:ring-2 focus:ring-blue-500`}
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.0"
                            />
                            {!hasEnoughFunds && (
                                <p className="mt-1 text-sm text-red-600">Insufficient funds</p>
                            )}
                        </div>

                        {/* Selected UTXOs */}
                        {selectedUtxos.length > 0 && (
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Source UTXOs ({selectedUtxos.length})
                                </label>
                                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded">
                                    {selectedUtxos.map((utxo, index) => (
                                        <div
                                            key={`${utxo.txid}-${utxo.vout}`}
                                            className={`p-2 ${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} border-b border-gray-200 last:border-b-0`}
                                        >
                                            <div className="flex justify-between items-center">
                                                <div className="font-mono text-xs break-all" title={`${utxo.txid}:${utxo.vout}`}>
                                                    {utxo.txid}:{utxo.vout}
                                                </div>
                                                <div className="text-sm font-medium ml-2">{utxo.formattedValue}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="mb-4 p-2 bg-red-100 text-red-700 rounded">
                                {error}
                            </div>
                        )}

                        <div className="flex justify-end space-x-2">
                            <button
                                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                                onClick={resetAndClose}
                            >
                                Cancel
                            </button>
                            <button
                                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                                onClick={handleSendClick}
                            >
                                Send Now
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <h2 className="text-xl font-semibold mb-4">Confirm Transaction</h2>

<<<<<<< HEAD
                        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                            <p className="font-medium">Are you sure you want to send:</p>
                            <p className="mt-2"><span className="font-semibold">{amount} BTC</span> to</p>
                            <p className="mt-1 font-mono text-xs">{destinationAddress}</p>
                            <div className="mt-3 pt-3 border-t border-yellow-200">
                                <p className="font-medium">Using {selectedUtxos.length} UTXOs:</p>
                                <p className="mt-1 text-sm">Total input: <span className="font-medium">{formatSats(totalSelected)} BTC</span></p>
                                <p className="text-sm">Network fee: <span className="font-medium">{formatSats(totalSelected - parseFloat(amount) * 100000000)} BTC</span></p>
                            </div>
                        </div>
=======
                        {transactionData?.decodedTx && (
                            <div className="mb-4">
                                <pre className="bg-gray-900 text-white p-4 rounded overflow-auto text-xs font-mono">
                                    {JSON.stringify(transactionData.decodedTx, null, 2)}
                                </pre>
                            </div>
                        )}

                        {error && (
                            <div className="mb-4 p-2 bg-red-100 text-red-700 rounded">
                                {error}
                            </div>
                        )}
>>>>>>> feature/sign-2-txs

                        <div className="flex justify-end space-x-2">
                            <button
                                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                                onClick={() => setShowConfirmation(false)}
<<<<<<< HEAD
=======
                                disabled={isSubmitting}
>>>>>>> feature/sign-2-txs
                            >
                                No, Cancel
                            </button>
                            <button
<<<<<<< HEAD
                                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                                onClick={handleConfirmSend}
                            >
                                Yes, Send Now
=======
                                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-green-300 disabled:cursor-not-allowed"
                                onClick={handleConfirmSend}
                disabled={isSubmitting}
                            >
                {isSubmitting ? 'Sending...' : 'Yes, Send Now'}
>>>>>>> feature/sign-2-txs
            </button>
        </div>
                    </>
                )
}
            </div >
        </div >
    );
}
