'use client';

import { useState, useEffect, useMemo } from 'react';
import { createUnsignedTransaction } from '@/services/wallet/core/transaction';
import { signTransaction } from '@/services/wallet/core/sign';
import { broadcastService } from '@/services/wallet/broadcast-service';
import { utxoService } from '@/services/utxo';
import { decodeTx } from '@/utils/txDecoder';
import config from '@/config';
import * as bitcoin from 'bitcoinjs-lib';

export default function SendBitcoinDialog({ isOpen, onClose, confirmedUtxos, onSend, formatSats }) {
    const [destinationAddress, setDestinationAddress] = useState('tb1pjrtlv2pqe3yq07jrx09em956yl2taav5p47jtuveehmrlw9jy4qq4gf4c2');
    const [amount, setAmount] = useState('0.000014'); // 5000 satoshis
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [error, setError] = useState('');
    const [selectedUtxos, setSelectedUtxos] = useState([]);
    const [totalSelected, setTotalSelected] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [txId, setTxId] = useState(null);
    const [feeRate, setFeeRate] = useState(1); // Default fee rate in sats/byte
    const [transactionData, setTransactionData] = useState(null);

    // Update selected UTXOs based on amount
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

    // Select optimal UTXOs for transaction amount
    const selectUtxosForAmount = (utxos, amountInSats) => {
        // Create temporary UTXO map structure
        const tempUtxoMap = { 'temp-address': utxos };

        // Convert to BTC and select UTXOs
        const amountBtc = amountInSats / 100000000;
        const selectedUtxos = utxoService.selectUtxos(tempUtxoMap, amountBtc, feeRate);

        // Sum selected UTXO values
        const totalValue = selectedUtxos.reduce((sum, utxo) => sum + utxo.value, 0);

        return {
            utxos: selectedUtxos,
            total: totalValue
        };
    };

    // Check for sufficient funds
    const hasEnoughFunds = useMemo(() => {
        if (!amount || isNaN(parseFloat(amount))) return true;
        const amountInSats = parseFloat(amount) * 100000000;
        return totalSelected >= amountInSats;
    }, [amount, totalSelected]);

    // Retrieve scriptPubKey for transaction input
    const fetchScriptPubKey = async (utxo) => {
        try {
            // Use existing scriptPubKey if available
            if (utxo.scriptPubKey) {
                return utxo.scriptPubKey;
            }

            // Fetch transaction details from API
            const apiUrl = `${config.api.wallet}/bitcoin-rpc/prev-txs/${utxo.txid}`;
            console.log(`Fetching transaction details from: ${apiUrl}`);

            const response = await fetch(apiUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Validate API response
            const txHexArray = await response.json();
            if (!txHexArray || txHexArray.length === 0) {
                throw new Error(`No transaction data returned for: ${utxo.txid}`);
            }

            // Extract transaction hex
            const txHex = txHexArray[0];

            // Parse transaction data
            const decodedTx = decodeTx(txHex);

            // Locate matching output
            const output = decodedTx.outputs.find(output => output.index === utxo.vout);

            if (!output || !output.scriptPubKey) {
                throw new Error(`Could not find scriptPubKey for UTXO: ${utxo.txid}:${utxo.vout}`);
            }

            console.log(`Found scriptPubKey for UTXO ${utxo.txid}:${utxo.vout}: ${output.scriptPubKey}`);
            return output.scriptPubKey;
        } catch (error) {
            console.error(`Failed to fetch scriptPubKey for UTXO: ${utxo.txid}:${utxo.vout}`, error);
            throw error;
        }
    };

    const handleSendClick = async () => {
        try {
            // Validate input fields
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

            // Log transaction inputs
            console.log('Selected UTXOs for transaction:', selectedUtxos);

            // Reset error state
            setError('');

            // Retrieve missing scriptPubKey data
            setError('Fetching transaction details for UTXOs...');
            const enhancedUtxos = [...selectedUtxos];

            try {
                for (let i = 0; i < enhancedUtxos.length; i++) {
                    if (!enhancedUtxos[i].scriptPubKey) {
                        console.log(`Fetching scriptPubKey for UTXO: ${enhancedUtxos[i].txid}:${enhancedUtxos[i].vout}`);
                        const scriptPubKey = await fetchScriptPubKey(enhancedUtxos[i]);
                        enhancedUtxos[i] = {
                            ...enhancedUtxos[i],
                            scriptPubKey
                        };
                        console.log(`Got scriptPubKey: ${scriptPubKey}`);
                    }
                }
            } catch (err) {
                console.error('Error fetching scriptPubKey:', err);
                setError(`Failed to fetch transaction details: ${err.message}`);
                return;
            }

            // Clear progress message
            setError('');

            // Construct transaction data
            const txData = {
                utxos: enhancedUtxos,
                destinationAddress,
                amount: parseFloat(amount),
                feeRate,
                // The change address will be determined by the service
                // but we can provide a default from the selected UTXOs
                changeAddress: enhancedUtxos[0]?.address || destinationAddress
            };

            console.log('Transaction data prepared:', txData);

            // Generate unsigned transaction
            console.log('Creating unsigned Bitcoin transaction...');
            const unsignedTxHex = await createUnsignedTransaction(txData);
            console.log('Unsigned transaction created:', unsignedTxHex.substring(0, 50) + '...');

            // Sign transaction with wallet keys
            console.log('Signing transaction locally...');
            const txHex = await signTransaction(txData);
            console.log('Transaction signed, hex:', txHex.substring(0, 50) + '...');

            // Parse for confirmation display
            const decodedTx = decodeTx(txHex);

            // Store complete transaction data
            setTransactionData({
                ...txData,
                unsignedTxHex,
                txHex,
                decodedTx
            });

            // Display confirmation screen
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

            // Broadcast signed transaction
            const result = await broadcastService.broadcastTransaction(transactionData.txHex);

            // Save transaction identifier
            setTxId(result.txid);

            // Trigger parent component callback
            onSend({
                utxos: selectedUtxos,
                destinationAddress,
                amount: parseFloat(amount),
                txid: result.txid,
                unsignedTxHex: transactionData.unsignedTxHex,
                txHex: transactionData.txHex
            });

            // Clean up and close
            resetAndClose();
        } catch (err) {
            console.error('Failed to send transaction:', err);
            setError(err.response?.data?.message || err.message || 'Failed to send transaction');
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetAndClose = () => {
        setDestinationAddress('tb1pjrtlv2pqe3yq07jrx09em956yl2taav5p47jtuveehmrlw9jy4qq4gf4c2');
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

                        {/* Input UTXOs list */}
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

                        <div className="flex justify-end space-x-2">
                            <button
                                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                                onClick={() => setShowConfirmation(false)}
                                disabled={isSubmitting}
                            >
                                No, Cancel
                            </button>
                            <button
                                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-green-300 disabled:cursor-not-allowed"
                                onClick={handleConfirmSend}
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? 'Sending...' : 'Yes, Send Now'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
