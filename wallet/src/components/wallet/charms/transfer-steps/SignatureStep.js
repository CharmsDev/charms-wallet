'use client';

import { useState } from 'react';
import { decodeTx } from '@/lib/bitcoin/txDecoder';
import { signCommitTransaction } from '@/services/charms/sign/signCommitTx';
import { signSpellTransaction } from '@/services/charms/sign/signSpellTx';

export default function SignatureStep({
    transactionResult,
    seedPhrase,
    addLogMessage,
    setSignedCommitTx,
    setSignedSpellTx,
    signedCommitTx,
    signedSpellTx
}) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    // Sign both transactions
    const signBothTransactions = async () => {
        if (!transactionResult || !transactionResult.transactions) {
            addLogMessage('No transactions to sign');
            return;
        }

        // Clear any previous error and set loading state
        setIsLoading(true);
        setError(null);

        // Add a log message to indicate a new signing attempt
        addLogMessage('Starting transaction signing process...');

        try {
            // Step 1: Sign the commit transaction
            addLogMessage('Signing commit transaction...');
            const signedCommit = await signCommitTransaction(
                transactionResult.transactions.commit_tx,
                addLogMessage
            );

            // Store the signed commit transaction
            setSignedCommitTx(signedCommit);
            addLogMessage('Commit transaction signed successfully!');

            // Step 2: Sign the spell transaction
            addLogMessage('Signing spell transaction...');

            // Check if we have a seed phrase
            if (!seedPhrase) {
                throw new Error('No wallet available for signing spell transaction');
            }

            // Sign the spell transaction
            const signedSpell = await signSpellTransaction(
                transactionResult.transactions.spell_tx,
                transactionResult.transactions.commit_tx,
                seedPhrase,
                addLogMessage
            );

            // Store the signed spell transaction
            setSignedSpellTx(signedSpell);
            addLogMessage('Spell transaction signed successfully!');
            addLogMessage('Both transactions signed successfully!');

        } catch (error) {
            setError(error.message);
            addLogMessage(`Error signing transactions: ${error.message}`);

            // Check if it's a network error
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                addLogMessage('Network error: Check if the API server is running');
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Decode signed transactions for display
    const decodedSignedCommitTx = signedCommitTx ? decodeTx(signedCommitTx.signedTxHex) : null;
    const decodedSignedSpellTx = signedSpellTx ? decodeTx(signedSpellTx.hex) : null;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h4 className="font-medium text-gray-900">Sign Transactions</h4>
                <div className="space-x-2">
                    <button
                        onClick={signBothTransactions}
                        disabled={isLoading || !transactionResult || (signedCommitTx && signedSpellTx)}
                        className={`px-4 py-2 rounded ${isLoading || !transactionResult || (signedCommitTx && signedSpellTx)
                            ? 'bg-gray-300 cursor-not-allowed'
                            : 'bg-blue-500 text-white hover:bg-blue-600'
                            }`}
                    >
                        {isLoading ? 'Signing...' : (signedCommitTx && signedSpellTx) ? 'Transactions Signed' : 'Sign Transactions'}
                    </button>
                    {signedCommitTx && signedSpellTx && (
                        <span className="text-xs text-green-600 font-medium">
                            ✓ Both Signed
                        </span>
                    )}
                </div>
            </div>

            {error && (
                <div className="bg-red-50 p-4 rounded-lg border border-red-200 text-red-700">
                    <h5 className="font-medium mb-2">Error</h5>
                    <p className="text-sm">{error}</p>
                </div>
            )}

            <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-500 mb-4">
                    This step signs the transactions with your wallet's private key. Click the button above to sign the transactions.
                </p>

                {/* Signed transaction details */}
                {signedCommitTx && (
                    <div className="space-y-4">
                        <div>
                            <h5 className="font-medium text-gray-900 mb-2">Signed Commit Transaction</h5>
                            <div className="bg-gray-800 text-green-400 p-3 rounded-md overflow-x-auto text-xs font-mono h-48 overflow-y-auto">
                                <div>TXID: {decodedSignedCommitTx?.txid || 'Unknown'}</div>
                                <div>Size: {decodedSignedCommitTx?.size || 0} bytes</div>
                                <div>Has Witness: {decodedSignedCommitTx?.hasWitness ? 'Yes' : 'No'}</div>
                                <div className="mt-2 border-t border-gray-700 pt-2">
                                    <div className="font-bold mb-1">Transaction Hex:</div>
                                    <div className="break-all">{signedCommitTx?.signedTxHex || 'Not available'}</div>
                                </div>
                            </div>
                        </div>

                        {signedSpellTx && (
                            <div>
                                <h5 className="font-medium text-gray-900 mb-2">Signed Spell Transaction</h5>
                                <div className="bg-gray-800 text-green-400 p-3 rounded-md overflow-x-auto text-xs font-mono h-48 overflow-y-auto">
                                    <div>TXID: {decodedSignedSpellTx?.txid || 'Unknown'}</div>
                                    <div>Size: {decodedSignedSpellTx?.size || 0} bytes</div>
                                    <div>Has Witness: {decodedSignedSpellTx?.hasWitness ? 'Yes' : 'No'}</div>
                                    <div className="mt-2 border-t border-gray-700 pt-2">
                                        <div className="font-bold mb-1">Transaction Hex:</div>
                                        <div className="break-all">{signedSpellTx?.hex || 'Not available'}</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {!signedCommitTx && !isLoading && transactionResult && (
                    <div className="space-y-4">
                        <div>
                            <h5 className="font-medium text-gray-900 mb-2">Unsigned Commit Transaction</h5>
                            <div className="bg-gray-800 text-amber-400 p-3 rounded-md overflow-x-auto text-xs font-mono h-48 overflow-y-auto">
                                <div>TXID: {decodeTx(transactionResult.transactions.commit_tx)?.txid || 'Unknown'}</div>
                                <div>Size: {decodeTx(transactionResult.transactions.commit_tx)?.size || 0} bytes</div>
                                <div className="mt-2 border-t border-gray-700 pt-2">
                                    <div className="font-bold mb-1">Transaction Hex:</div>
                                    <div className="break-all">{transactionResult.transactions.commit_tx || 'Not available'}</div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h5 className="font-medium text-gray-900 mb-2">Unsigned Spell Transaction</h5>
                            <div className="bg-gray-800 text-amber-400 p-3 rounded-md overflow-x-auto text-xs font-mono h-48 overflow-y-auto">
                                <div>TXID: {decodeTx(transactionResult.transactions.spell_tx)?.txid || 'Unknown'}</div>
                                <div>Size: {decodeTx(transactionResult.transactions.spell_tx)?.size || 0} bytes</div>
                                <div className="mt-2 border-t border-gray-700 pt-2">
                                    <div className="font-bold mb-1">Transaction Hex:</div>
                                    <div className="break-all">{transactionResult.transactions.spell_tx || 'Not available'}</div>
                                </div>
                            </div>
                        </div>

                        <div className="text-center py-4">
                            <p className="text-gray-500">Transactions ready to sign.</p>
                            <p className="text-gray-400 text-sm mt-2">
                                Click the "Sign Transactions" button to sign the transactions with your wallet.
                            </p>
                        </div>
                    </div>
                )}

                {!transactionResult && !isLoading && (
                    <div className="text-center py-8">
                        <p className="text-gray-500">No transactions available to sign.</p>
                        <p className="text-gray-400 text-sm mt-2">
                            Please go back to the previous step and create transactions first.
                        </p>
                    </div>
                )}

                {isLoading && (
                    <div className="text-center py-8">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                        <p className="mt-2 text-gray-600">Signing transactions...</p>
                    </div>
                )}
            </div>

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h5 className="font-medium text-blue-800 mb-2">Information</h5>
                <p className="text-sm text-blue-700">
                    Signing the transactions authorizes the transfer of your charm. Both transactions must be signed with your wallet's private key.
                </p>
            </div>
        </div>
    );
}
