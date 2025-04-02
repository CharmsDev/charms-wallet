'use client';

import { useState } from 'react';
import { decodeTx } from '@/lib/bitcoin/txDecoder';
import { signCommitTransaction } from '@/services/repository/signCommitTx';
import { signSpellTransaction } from '@/services/repository/signSpellTx';

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

    // Sign commit transaction
    const signCommitTx = async () => {
        if (!transactionResult || !transactionResult.transactions) {
            addLogMessage('No transactions to sign');
            return;
        }

        // Clear any previous error and set loading state
        setIsLoading(true);
        setError(null);

        // Add a log message to indicate a new signing attempt
        addLogMessage('Starting new commit transaction signing attempt...');

        try {
            // Check if we have a seed phrase
            if (!seedPhrase) {
                throw new Error('No wallet available for signing');
            }

            // Sign the commit transaction
            const signedCommit = await signCommitTransaction(
                transactionResult.transactions.commit_tx,
                seedPhrase,
                transactionResult.utxoAmount || 19073, // Default to 19073 satoshis if not provided
                transactionResult.utxoInternalKey || '6eb2ec4ab68e29176884e783dfd93bc42b9310f5ae47a202d0978988cebe1f87', // Default internal key from sign.js
                undefined, // Use default network
                undefined, // Use default derivation path
                addLogMessage
            );

            // Store the signed commit transaction
            setSignedCommitTx(signedCommit);
        } catch (error) {
            setError(error.message);
            addLogMessage(`Error signing commit transaction: ${error.message}`);

            // Check if it's a network error
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                addLogMessage('Network error: Check if the API server is running');
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Sign spell transaction
    const signSpellTx = async () => {
        if (!transactionResult || !transactionResult.transactions || !signedCommitTx) {
            addLogMessage('Commit transaction must be signed first');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // Check if we have a seed phrase
            if (!seedPhrase) {
                throw new Error('No wallet available for signing');
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
        } catch (error) {
            setError(error.message);
            addLogMessage(`Error signing spell transaction: ${error.message}`);

            // Check if it's a network error
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                addLogMessage('Network error: Check if the API server is running');
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Decode signed transactions for display
    const decodedSignedCommitTx = signedCommitTx ? decodeTx(signedCommitTx.hex) : null;
    const decodedSignedSpellTx = signedSpellTx ? decodeTx(signedSpellTx.hex) : null;

    return (
        <div className="space-y-6">
            {/* Testing mode banner */}
            <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200 mb-4">
                <p className="text-sm text-yellow-700 font-medium">
                    🧪 Testing Mode: The "Sign Commit Tx" button will remain available for multiple signing attempts.
                </p>
            </div>
            <div className="flex justify-between items-center">
                <h4 className="font-medium text-gray-900">Sign Transactions</h4>
                <div className="space-x-2">
                    <button
                        onClick={signCommitTx}
                        disabled={isLoading || !transactionResult}
                        className={`px-4 py-2 rounded ${isLoading || !transactionResult
                            ? 'bg-gray-300 cursor-not-allowed'
                            : 'bg-blue-500 text-white hover:bg-blue-600'
                            }`}
                    >
                        {isLoading ? 'Signing...' : 'Sign Commit Tx'}
                    </button>
                    {/* Testing mode indicator */}
                    {signedCommitTx && (
                        <span className="text-xs text-green-600 font-medium">
                            ✓ Signed (Testing Mode)
                        </span>
                    )}
                    <button
                        onClick={signSpellTx}
                        disabled={isLoading || !signedCommitTx || signedSpellTx}
                        className={`px-4 py-2 rounded ${isLoading || !signedCommitTx || signedSpellTx
                            ? 'bg-gray-300 cursor-not-allowed'
                            : 'bg-green-500 text-white hover:bg-green-600'
                            }`}
                    >
                        {isLoading && signedCommitTx && !signedSpellTx ? 'Signing...' : signedSpellTx ? 'Spell Signed' : 'Sign Spell Tx'}
                    </button>
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
                {signedCommitTx && signedSpellTx && (
                    <div className="space-y-4">
                        <div>
                            <h5 className="font-medium text-gray-900 mb-2">Signed Commit Transaction</h5>
                            <div className="bg-gray-800 text-green-400 p-3 rounded-md overflow-x-auto text-xs font-mono h-48 overflow-y-auto">
                                <div>TXID: {decodedSignedCommitTx?.txid || 'Unknown'}</div>
                                <div>Inputs: {decodedSignedCommitTx?.inputs?.length || 0}</div>
                                <div>Outputs: {decodedSignedCommitTx?.outputs?.length || 0}</div>
                                <div>Size: {decodedSignedCommitTx?.size || 0} bytes</div>
                                <div>Has Witness: {decodedSignedCommitTx?.hasWitness ? 'Yes' : 'No'}</div>
                                <div className="mt-2 border-t border-gray-700 pt-2">
                                    <div className="font-bold mb-1">Transaction Hex:</div>
                                    <div className="break-all">{signedCommitTx?.hex || 'Not available'}</div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h5 className="font-medium text-gray-900 mb-2">Signed Spell Transaction</h5>
                            <div className="bg-gray-800 text-green-400 p-3 rounded-md overflow-x-auto text-xs font-mono h-48 overflow-y-auto">
                                <div>TXID: {decodedSignedSpellTx?.txid || 'Unknown'}</div>
                                <div>Inputs: {decodedSignedSpellTx?.inputs?.length || 0}</div>
                                <div>Outputs: {decodedSignedSpellTx?.outputs?.length || 0}</div>
                                <div>Size: {decodedSignedSpellTx?.size || 0} bytes</div>
                                <div>Has Witness: {decodedSignedSpellTx?.hasWitness ? 'Yes' : 'No'}</div>
                                <div className="mt-2 border-t border-gray-700 pt-2">
                                    <div className="font-bold mb-1">Transaction Hex:</div>
                                    <div className="break-all">{signedSpellTx?.hex || 'Not available'}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {!signedCommitTx && !isLoading && transactionResult && (
                    <div className="text-center py-8">
                        <p className="text-gray-500">Transactions ready to sign.</p>
                        <p className="text-gray-400 text-sm mt-2">
                            Click the "Sign Transactions" button to sign the transactions with your wallet.
                        </p>
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
