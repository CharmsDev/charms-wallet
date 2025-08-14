'use client';

import { useState, useEffect, useMemo } from 'react';
import { TransactionOrchestrator } from '@/services/wallet/transaction-orchestrator';
import { UtxoSelector } from '@/services/wallet/utxo-selector';
import { decodeTx } from '@/utils/txDecoder';
import config from '@/config';

export default function SendBitcoinDialog({ isOpen, onClose, confirmedUtxos, onSend, formatValue }) {
    const [destinationAddress, setDestinationAddress] = useState('');
    const [amount, setAmount] = useState('');
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [showPreparing, setShowPreparing] = useState(false);
    const [error, setError] = useState('');
    const [selectedUtxos, setSelectedUtxos] = useState([]);
    const [totalSelected, setTotalSelected] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [txId, setTxId] = useState(null);
    const [feeRate, setFeeRate] = useState(5);
    const [transactionData, setTransactionData] = useState(null);
    const [preparingStatus, setPreparingStatus] = useState('');

    // Auto-select UTXOs when amount changes
    useEffect(() => {
        if (amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0) {
            selectUtxosIntelligently();
        } else {
            setSelectedUtxos([]);
            setTotalSelected(0);
        }
    }, [amount, confirmedUtxos]);

    const selectUtxosIntelligently = async () => {
        if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
            setSelectedUtxos([]);
            setTotalSelected(0);
            return;
        }

        try {
            const amountInSats = parseFloat(amount) * 100000000;
            const utxoSelector = new UtxoSelector();
            const selection = utxoSelector.selectUtxosForAmount(confirmedUtxos, amountInSats, feeRate);

            if (selection.sufficientFunds) {
                setSelectedUtxos(selection.selectedUtxos);
                setTotalSelected(selection.totalSelected);
                setError('');
            } else {
                setSelectedUtxos([]);
                setTotalSelected(0);
                setError(`Insufficient funds. Need ${(amountInSats + selection.estimatedFee).toLocaleString()} sats, available: ${selection.totalSelected.toLocaleString()} sats.`);
            }
        } catch (error) {
            setSelectedUtxos([]);
            setTotalSelected(0);
            setError('Error selecting UTXOs. Please try again.');
        }
    };

    const hasEnoughFunds = useMemo(() => {
        if (!amount || isNaN(parseFloat(amount))) return true;
        const amountInSats = parseFloat(amount) * 100000000;
        return totalSelected >= amountInSats;
    }, [amount, totalSelected]);

    const handleSendClick = async () => {
        try {
            if (!destinationAddress || !amount || selectedUtxos.length === 0) {
                setError('Please fill in all fields and ensure UTXOs are selected.');
                return;
            }

            if (!hasEnoughFunds) {
                setError('Insufficient funds for this transaction.');
                return;
            }

            setError('');
            setShowPreparing(true);
            setPreparingStatus('Creating transaction...');

            const orchestrator = new TransactionOrchestrator();
            const result = await orchestrator.processTransaction(destinationAddress, amount, selectedUtxos, feeRate);

            if (!result.success) {
                throw new Error(result.error);
            }

            setPreparingStatus('Decoding transaction...');
            const decodedTx = decodeTx(result.signedTxHex, config.network);

            setTransactionData({
                txHex: result.signedTxHex,
                decodedTx,
                size: result.signedTxHex.length / 2
            });

            setShowPreparing(false);
            setShowConfirmation(true);

        } catch (err) {
            setShowPreparing(false);
            setError(err.message || 'Transaction preparation failed');
        }
    };

    const handleConfirmSend = async () => {
        try {
            setIsSubmitting(true);
            setError('');

            const orchestrator = new TransactionOrchestrator();
            const result = await orchestrator.broadcastTransaction(transactionData.txHex);

            const utxoSelector = new UtxoSelector();
            utxoSelector.unlockUtxos(selectedUtxos);

            setTxId(result.txid);
            setShowConfirmation(false);
            setShowSuccess(true);

            if (onSend) {
                onSend({
                    txid: result.txid,
                    amount: parseFloat(amount),
                    destinationAddress,
                    utxos: selectedUtxos,
                    fee: transactionData?.size ? Math.ceil(transactionData.size * feeRate) : 0
                });
            }

        } catch (err) {
            const utxoSelector = new UtxoSelector();
            utxoSelector.unlockUtxos(selectedUtxos);
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetAndClose = () => {
        setDestinationAddress('');
        setAmount('');
        setShowConfirmation(false);
        setShowSuccess(false);
        setShowPreparing(false);
        setError('');
        setSelectedUtxos([]);
        setTotalSelected(0);
        setIsSubmitting(false);
        setTxId(null);
        setTransactionData(null);
        setPreparingStatus('');
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="card p-6 w-full max-w-3xl">
                {showSuccess ? (
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
                                        <div className="text-xl font-bold text-bitcoin-400 bitcoin-glow-text">{amount} BTC</div>
                                    </div>
                                    <div className="text-center p-4 bg-dark-800 rounded-lg border border-dark-700">
                                        <div className="text-sm text-dark-400 mb-1">Network Fee</div>
                                        <div className="text-lg font-semibold text-dark-200">{transactionData?.size ? `${Math.ceil(transactionData.size * feeRate)} sats` : 'N/A'}</div>
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
                                href={`https://mempool.space/testnet4/tx/${txId}`}
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
                                onClick={resetAndClose}
                            >
                                Close
                            </button>
                        </div>
                    </>
                ) : showPreparing ? (
                    <>
                        <h2 className="text-xl font-bold gradient-text mb-4">Preparing Transaction</h2>
                        <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-bitcoin-400 mr-3"></div>
                            <span className="text-dark-200">{preparingStatus}</span>
                        </div>
                    </>
                ) : showConfirmation ? (
                    <>
                        <h2 className="text-xl font-bold gradient-text mb-4">Confirm Transaction</h2>

                        {transactionData?.decodedTx && (
                            <div className="mb-4">
                                <pre className="bg-dark-900 text-dark-200 p-4 rounded-lg overflow-auto text-xs font-mono border border-dark-700">
                                    {JSON.stringify(transactionData.decodedTx, null, 2)}
                                </pre>
                            </div>
                        )}

                        {error && <div className="error-message">{error}</div>}

                        <div className="flex justify-end space-x-2">
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowConfirmation(false)}
                                disabled={isSubmitting}
                            >
                                No, Cancel
                            </button>
                            <button
                                className={`btn ${isSubmitting ? 'bg-green-700 opacity-50 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'} text-white`}
                                onClick={handleConfirmSend}
                                disabled={isSubmitting}
                            >
                                {isSubmitting ? 'Sending...' : 'Yes, Send Now'}
                            </button>
                        </div>
                    </>
                ) : (
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
                                className="input w-full"
                                placeholder="Enter Bitcoin address"
                            />
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm font-medium text-dark-200 mb-2">
                                Amount (BTC)
                            </label>
                            <input
                                type="number"
                                step="0.00000001"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="input w-full"
                                placeholder="0.00000000"
                            />
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm font-medium text-dark-200 mb-2">
                                Fee Rate (sats/byte)
                            </label>
                            <input
                                type="number"
                                value={feeRate}
                                onChange={(e) => setFeeRate(parseInt(e.target.value) || 1)}
                                className="input w-full"
                                min="1"
                            />
                        </div>

                        {selectedUtxos.length > 0 && (
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-dark-200 mb-2">
                                    Source UTXOs ({selectedUtxos.length})
                                </label>
                                <div className="max-h-40 overflow-y-auto border border-dark-600 rounded-lg bg-dark-800">
                                    {selectedUtxos.map((utxo, index) => (
                                        <div
                                            key={`${utxo.txid}-${utxo.vout}`}
                                            className={`p-2 ${index % 2 === 0 ? 'bg-dark-800' : 'bg-dark-750'} border-b border-dark-700 last:border-b-0`}
                                        >
                                            <div className="flex justify-between items-center">
                                                <div className="font-mono text-xs break-all text-dark-300" title={`${utxo.txid}:${utxo.vout}`}>
                                                    {utxo.txid}:{utxo.vout}
                                                </div>
                                                <div className="text-sm font-medium ml-2 text-bitcoin-400">{utxo.formattedValue}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {error && <div className="error-message">{error}</div>}

                        <div className="flex justify-end space-x-2">
                            <button className="btn btn-secondary" onClick={resetAndClose}>
                                Cancel
                            </button>
                            <button className="btn btn-bitcoin" onClick={handleSendClick}>
                                Send Now
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
