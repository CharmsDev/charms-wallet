'use client';

import { useState } from 'react';
import { decodeTx } from '@/lib/bitcoin/txDecoder';
import { signCommitTransaction } from '@/services/charms/sign/signCommitTx';
import { signSpellTransaction } from '@/services/charms/sign/signSpellTx';

/**
 * SignatureStep component handles the signing of commit and spell transactions for a Charm transfer.
 * It provides a UI for initiating the signing process and displays the status of both signed and unsigned transactions.
 *
 * @param {object} props - The component props.
 * @param {object} props.transactionResult - Contains the unsigned commit and spell transactions.
 * @param {string} props.seedPhrase - The user's seed phrase for signing the spell transaction.
 * @param {Function} props.addLogMessage - Callback to log messages during the signing process.
 * @param {Function} props.setSignedCommitTx - State setter for the signed commit transaction.
 * @param {Function} props.setSignedSpellTx - State setter for the signed spell transaction.
 * @param {object} props.signedCommitTx - The state of the signed commit transaction.
 * @param {object} props.signedSpellTx - The state of the signed spell transaction.
 * @returns {JSX.Element}
 */
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
    const [showSignedCommitDetails, setShowSignedCommitDetails] = useState(false);
    const [showSignedSpellDetails, setShowSignedSpellDetails] = useState(false);
    const [showUnsignedCommitDetails, setShowUnsignedCommitDetails] = useState(false);
    const [showUnsignedSpellDetails, setShowUnsignedSpellDetails] = useState(false);

    /**
     * Initiates the signing process for both the commit and spell transactions.
     * Handles loading states, errors, and logs progress messages.
     */
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
                <h4 className="font-bold gradient-text">Sign Transactions</h4>
                <div className="space-x-2">
                    <button
                        onClick={signBothTransactions}
                        disabled={isLoading || !transactionResult || (signedCommitTx && signedSpellTx)}
                        className={`px-4 py-2 rounded-lg ${isLoading || !transactionResult || (signedCommitTx && signedSpellTx)
                            ? 'bg-dark-600 cursor-not-allowed text-dark-400'
                            : 'bg-primary-500 text-white hover:bg-primary-600'
                            }`}
                    >
                        {isLoading ? 'Signing...' : (signedCommitTx && signedSpellTx) ? 'Transactions Signed' : 'Sign Transactions'}
                    </button>
                    {signedCommitTx && signedSpellTx && (
                        <span className="text-xs text-green-400 font-medium">
                            ✓ Both Signed
                        </span>
                    )}
                </div>
            </div>

            {error && (
                <div className="bg-red-900/30 p-4 rounded-lg border border-red-800 text-red-400">
                    <h5 className="font-medium mb-2">Error</h5>
                    <p className="text-sm">{error}</p>
                </div>
            )}

            <div className="glass-effect p-4 rounded-xl">
                <p className="text-sm text-gray-500 mb-4">
                    This step signs the transactions with your wallet's private key. Click the button above to sign the transactions.
                </p>

                {/* Signed transaction details */}
                {signedCommitTx && (
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <h5 className="font-medium text-white">Signed Commit Transaction</h5>
                                <button onClick={() => setShowSignedCommitDetails(!showSignedCommitDetails)} className="text-xs text-blue-400 hover:underline">
                                    {showSignedCommitDetails ? 'Hide Details' : 'View Details'}
                                </button>
                            </div>
                            {showSignedCommitDetails && (
                                <div className="bg-dark-800 text-green-400 p-3 rounded-md overflow-x-auto text-xs font-mono max-h-48 overflow-y-auto">
                                    <div>TXID: {decodedSignedCommitTx?.txid || 'Unknown'}</div>
                                    <div>Size: {decodedSignedCommitTx?.size || 0} bytes</div>
                                    <div>Has Witness: {decodedSignedCommitTx?.hasWitness ? 'Yes' : 'No'}</div>
                                    <div className="mt-2 border-t border-gray-700 pt-2">
                                        <div className="font-bold mb-1">Transaction Hex:</div>
                                        <div className="break-all">{signedCommitTx?.signedTxHex || 'Not available'}</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {signedSpellTx && (
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <h5 className="font-medium text-white">Signed Spell Transaction</h5>
                                    <button onClick={() => setShowSignedSpellDetails(!showSignedSpellDetails)} className="text-xs text-blue-400 hover:underline">
                                        {showSignedSpellDetails ? 'Hide Details' : 'View Details'}
                                    </button>
                                </div>
                                {showSignedSpellDetails && (
                                    <div className="bg-dark-800 text-green-400 p-3 rounded-md overflow-x-auto text-xs font-mono max-h-48 overflow-y-auto">
                                        <div>TXID: {decodedSignedSpellTx?.txid || 'Unknown'}</div>
                                        <div>Size: {decodedSignedSpellTx?.size || 0} bytes</div>
                                        <div>Has Witness: {decodedSignedSpellTx?.hasWitness ? 'Yes' : 'No'}</div>
                                        <div className="mt-2 border-t border-gray-700 pt-2">
                                            <div className="font-bold mb-1">Transaction Hex:</div>
                                            <div className="break-all">{signedSpellTx?.hex || 'Not available'}</div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {!signedCommitTx && !isLoading && transactionResult && (
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <h5 className="font-medium text-white">Unsigned Commit Transaction</h5>
                                <button onClick={() => setShowUnsignedCommitDetails(!showUnsignedCommitDetails)} className="text-xs text-blue-400 hover:underline">
                                    {showUnsignedCommitDetails ? 'Hide Details' : 'View Details'}
                                </button>
                            </div>
                            {showUnsignedCommitDetails && (
                                <div className="bg-dark-800 text-amber-400 p-3 rounded-md overflow-x-auto text-xs font-mono max-h-48 overflow-y-auto">
                                    <div>TXID: {decodeTx(transactionResult.transactions.commit_tx)?.txid || 'Unknown'}</div>
                                    <div>Size: {decodeTx(transactionResult.transactions.commit_tx)?.size || 0} bytes</div>
                                    <div className="mt-2 border-t border-gray-700 pt-2">
                                        <div className="font-bold mb-1">Transaction Hex:</div>
                                        <div className="break-all">{transactionResult.transactions.commit_tx || 'Not available'}</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <h5 className="font-medium text-white">Unsigned Spell Transaction</h5>
                                <button onClick={() => setShowUnsignedSpellDetails(!showUnsignedSpellDetails)} className="text-xs text-blue-400 hover:underline">
                                    {showUnsignedSpellDetails ? 'Hide Details' : 'View Details'}
                                </button>
                            </div>
                            {showUnsignedSpellDetails && (
                                <div className="bg-dark-800 text-amber-400 p-3 rounded-md overflow-x-auto text-xs font-mono max-h-48 overflow-y-auto">
                                    <div>TXID: {decodeTx(transactionResult.transactions.spell_tx)?.txid || 'Unknown'}</div>
                                    <div>Size: {decodeTx(transactionResult.transactions.spell_tx)?.size || 0} bytes</div>
                                    <div className="mt-2 border-t border-gray-700 pt-2">
                                        <div className="font-bold mb-1">Transaction Hex:</div>
                                        <div className="break-all">{transactionResult.transactions.spell_tx || 'Not available'}</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="text-center py-4">
                            <p className="text-dark-300">Transactions ready to sign.</p>
                            <p className="text-dark-400 text-sm mt-2">
                                Click the "Sign Transactions" button to sign the transactions with your wallet.
                            </p>
                        </div>
                    </div>
                )}

                {!transactionResult && !isLoading && (
                    <div className="text-center py-8">
                        <p className="text-dark-300">No transactions available to sign.</p>
                        <p className="text-dark-400 text-sm mt-2">
                            Please go back to the previous step and create transactions first.
                        </p>
                    </div>
                )}

                {isLoading && (
                    <div className="text-center py-8">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500"></div>
                        <p className="mt-2 text-dark-300">Signing transactions...</p>
                    </div>
                )}
            </div>

            <div className="bg-blue-900/20 p-4 rounded-lg border border-blue-800/50">
                <h5 className="font-medium text-blue-400 mb-2">Information</h5>
                <p className="text-sm text-blue-300">
                    Signing the transactions authorizes the transfer of your charm. Both transactions must be signed with your wallet's private key.
                </p>
            </div>
        </div>
    );
}
