'use client';

import { useState, useEffect } from 'react';
import { decodeTx } from '@/lib/bitcoin/txDecoder';
import { transferCharmService } from '@/services/charms/transfer';
import { useUTXOs } from '@/stores/utxoStore';

export default function ProveSpellStep({
    charm,
    destinationAddress,
    transferAmount,
    finalSpell,
    addLogMessage,
    setCommitTxHex,
    setSpellTxHex,
    setTransactionResult,
    commitTxHex,
    spellTxHex
}) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [highestUtxo, setHighestUtxo] = useState(null);
    const { utxos } = useUTXOs();

    // Find highest amount UTXO
    useEffect(() => {
        let maxUtxo = null;
        let maxValue = 0;

        // Iterate through all UTXOs to find the one with the highest value
        Object.entries(utxos).forEach(([address, addressUtxos]) => {
            addressUtxos.forEach(utxo => {
                if (utxo.value > maxValue) {
                    maxValue = utxo.value;
                    maxUtxo = {
                        txid: utxo.txid,
                        vout: utxo.vout,
                        value: utxo.value,
                        address
                    };
                }
            });
        });

        setHighestUtxo(maxUtxo);
    }, [utxos]);

    // Create transfer transactions
    const createTransferTransactions = async () => {
        setIsLoading(true);
        setError(null);

        try {
            addLogMessage(`Initiating transfer of ${transferAmount} charms to ${destinationAddress}...`);

            // Set funding UTXO - use the highest value UTXO if available, otherwise use the charm's UTXO
            const fundingUtxoId = highestUtxo
                ? `${highestUtxo.txid}:${highestUtxo.vout}`
                : `${charm.txid}:${charm.outputIndex}`;

            // Set funding UTXO amount
            const fundingUtxoAmount = highestUtxo
                ? highestUtxo.value
                : charm.amount.remaining;

            addLogMessage(`Using funding UTXO: ${fundingUtxoId} with amount: ${fundingUtxoAmount}`);

            // Use the transfer charm service to create the transactions
            const result = await transferCharmService.createTransferCharmTxs(
                destinationAddress,
                fundingUtxoAmount,
                finalSpell,
                fundingUtxoId
            );

            // Store the transaction hexes
            setCommitTxHex(result.transactions.commit_tx);
            setSpellTxHex(result.transactions.spell_tx);
            setTransactionResult(result);

            addLogMessage('Transactions created successfully!');

            return result;
        } catch (error) {
            setError(error.message);
            addLogMessage(`Error creating transactions: ${error.message}`);

            // Check if it's a network error
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                addLogMessage('Network error: Check if the API server is running');
            }

            return null;
        } finally {
            setIsLoading(false);
        }
    };

    // Decode transaction for display
    const decodedCommitTx = commitTxHex ? decodeTx(commitTxHex) : null;
    const decodedSpellTx = spellTxHex ? decodeTx(spellTxHex) : null;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h4 className="font-medium text-gray-900">Prove Spell</h4>
                <button
                    onClick={createTransferTransactions}
                    disabled={isLoading || !finalSpell || commitTxHex}
                    className={`px-4 py-2 rounded ${isLoading || !finalSpell || commitTxHex
                        ? 'bg-gray-300 cursor-not-allowed'
                        : 'bg-blue-500 text-white hover:bg-blue-600'
                        }`}
                >
                    {isLoading ? 'Creating...' : commitTxHex ? 'Created' : 'Create Transactions'}
                </button>
            </div>

            {error && (
                <div className="bg-red-50 p-4 rounded-lg border border-red-200 text-red-700">
                    <h5 className="font-medium mb-2">Error</h5>
                    <p className="text-sm">{error}</p>
                </div>
            )}

            <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-500 mb-4">
                    This step creates the transactions needed to transfer your charm. Click the button above to generate the transactions.
                </p>

                {/* Funding UTXO Information */}
                <div className="mb-4 p-3 bg-blue-50 rounded-md border border-blue-100">
                    <h5 className="text-sm font-medium text-blue-800 mb-1">Funding UTXO Information</h5>
                    {highestUtxo ? (
                        <div className="text-xs font-mono">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-blue-700">UTXO ID:</span>
                                <span className="text-blue-900">{highestUtxo.txid}:{highestUtxo.vout}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-blue-700">Amount:</span>
                                <span className="text-blue-900 font-semibold">{highestUtxo.value} sats</span>
                            </div>
                        </div>
                    ) : (
                        <div className="text-xs font-mono">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-blue-700">UTXO ID:</span>
                                <span className="text-blue-900">{charm.txid}:{charm.outputIndex}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-blue-700">Amount:</span>
                                <span className="text-blue-900 font-semibold">{charm.amount.remaining} {charm.amount.ticker}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Transaction details */}
                {commitTxHex && spellTxHex && (
                    <div className="space-y-4">
                        <div>
                            <h5 className="font-medium text-gray-900 mb-2">Commit Transaction</h5>
                            <div className="bg-gray-800 text-green-400 p-3 rounded-md overflow-x-auto text-xs font-mono h-32 overflow-y-auto">
                                <div>TXID: {decodedCommitTx?.txid || 'Unknown'}</div>
                                <div>Inputs: {decodedCommitTx?.inputs?.length || 0}</div>
                                <div>Outputs: {decodedCommitTx?.outputs?.length || 0}</div>
                                <div>Size: {decodedCommitTx?.size || 0} bytes</div>
                            </div>
                        </div>

                        <div>
                            <h5 className="font-medium text-gray-900 mb-2">Spell Transaction</h5>
                            <div className="bg-gray-800 text-green-400 p-3 rounded-md overflow-x-auto text-xs font-mono h-32 overflow-y-auto">
                                <div>TXID: {decodedSpellTx?.txid || 'Unknown'}</div>
                                <div>Inputs: {decodedSpellTx?.inputs?.length || 0}</div>
                                <div>Outputs: {decodedSpellTx?.outputs?.length || 0}</div>
                                <div>Size: {decodedSpellTx?.size || 0} bytes</div>
                            </div>
                        </div>
                    </div>
                )}

                {!commitTxHex && !isLoading && (
                    <div className="text-center py-8">
                        <p className="text-gray-500">No transactions created yet.</p>
                        <p className="text-gray-400 text-sm mt-2">
                            Click the "Create Transactions" button to generate the transactions.
                        </p>
                    </div>
                )}

                {isLoading && (
                    <div className="text-center py-8">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                        <p className="mt-2 text-gray-600">Creating transactions...</p>
                    </div>
                )}
            </div>

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h5 className="font-medium text-blue-800 mb-2">Information</h5>
                <p className="text-sm text-blue-700">
                    The transfer process requires two transactions: a commit transaction and a spell transaction.
                    The commit transaction locks the funds, and the spell transaction executes the charm transfer.
                </p>
            </div>
        </div>
    );
}
