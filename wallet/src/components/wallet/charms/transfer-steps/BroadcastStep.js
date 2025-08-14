'use client';

import { useState } from 'react';
import { useCharms } from '@/stores/charmsStore';
import { broadcastTransactions } from '@/services/charms/sign/submit-charm-txs';

export default function BroadcastStep({
    signedCommitTx,
    signedSpellTx,
    addLogMessage,
    charm
}) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [broadcastResult, setBroadcastResult] = useState(null);
    const { refreshCharms } = useCharms();

    // Broadcast transactions
    const handleBroadcast = async () => {
        if (!signedCommitTx || !signedSpellTx) {
            addLogMessage('No signed transactions to broadcast');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // Broadcast the transactions
            const result = await broadcastTransactions(
                signedCommitTx,
                signedSpellTx,
                addLogMessage
            );

            // Store the result
            setBroadcastResult({
                commitTxId: result.commitData.txid,
                spellTxId: result.spellData.txid
            });

            // Update the charm with the transaction IDs
            const updatedCharm = {
                ...charm,
                commitTxId: result.commitData.txid,
                spellTxId: result.spellData.txid
            };

            // Store transactions in localStorage for reference
            localStorage.setItem('commitTransaction', JSON.stringify(signedCommitTx));
            localStorage.setItem('spellTransaction', JSON.stringify(signedSpellTx));

            // Refresh the charms list to reflect the changes
            await refreshCharms();

            addLogMessage('Transfer completed successfully!');
        } catch (error) {
            setError(error.message);
            addLogMessage(`Error broadcasting transactions: ${error.message}`);

            // Check if it's a network error
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                addLogMessage('Network error: Check if the API server is running');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h4 className="font-bold gradient-text">Broadcast Transactions</h4>
                <button
                    onClick={handleBroadcast}
                    disabled={isLoading || !signedCommitTx || !signedSpellTx || broadcastResult}
                    className={`px-4 py-2 rounded-lg ${isLoading || !signedCommitTx || !signedSpellTx || broadcastResult
                        ? 'bg-dark-600 cursor-not-allowed text-dark-400'
                        : 'bg-primary-500 text-white hover:bg-primary-600'
                        }`}
                >
                    {isLoading ? 'Broadcasting...' : broadcastResult ? 'Broadcasted' : 'Broadcast Transactions'}
                </button>
            </div>

            {error && (
                <div className="bg-red-900/30 p-4 rounded-lg border border-red-800 text-red-400">
                    <h5 className="font-medium mb-2">Error</h5>
                    <p className="text-sm">{error}</p>
                </div>
            )}

            <div className="glass-effect p-4 rounded-xl">
                <p className="text-sm text-gray-500 mb-4">
                    This step broadcasts the signed transactions to the Bitcoin network. Click the button above to broadcast the transactions.
                </p>

                {/* Broadcast result */}
                {broadcastResult && (
                    <div className="bg-green-900/30 p-4 rounded-lg border border-green-800 text-green-400">
                        <h5 className="font-medium mb-2">Transfer Successful!</h5>
                        <div className="space-y-2 text-sm">
                            <p>Your charm has been successfully transferred.</p>
                            <div>
                                <p className="font-medium">Commit Transaction ID:</p>
                                <p className="font-mono break-all text-white">{broadcastResult.commitTxId}</p>
                            </div>
                            <div>
                                <p className="font-medium">Spell Transaction ID:</p>
                                <p className="font-mono break-all text-white">{broadcastResult.spellTxId}</p>
                            </div>
                            <p className="mt-4">
                                You can view these transactions on a Bitcoin testnet explorer.
                            </p>
                        </div>
                    </div>
                )}

                {!signedCommitTx && !signedSpellTx && !isLoading && (
                    <div className="text-center py-8">
                        <p className="text-dark-300">No signed transactions available to broadcast.</p>
                        <p className="text-dark-400 text-sm mt-2">
                            Please go back to the previous step and sign the transactions first.
                        </p>
                    </div>
                )}

                {signedCommitTx && signedSpellTx && !broadcastResult && !isLoading && (
                    <div className="text-center py-8">
                        <p className="text-dark-300">Transactions ready to broadcast.</p>
                        <p className="text-dark-400 text-sm mt-2">
                            Click the "Broadcast Transactions" button to send the transactions to the Bitcoin network.
                        </p>
                    </div>
                )}

                {isLoading && (
                    <div className="text-center py-8">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500"></div>
                        <p className="mt-2 text-dark-300">Broadcasting transactions...</p>
                    </div>
                )}
            </div>

            <div className="bg-blue-900/20 p-4 rounded-lg border border-blue-800/50">
                <h5 className="font-medium text-blue-400 mb-2">Information</h5>
                <p className="text-sm text-blue-300">
                    Broadcasting the transactions finalizes the transfer of your charm. The commit transaction must be confirmed first, followed by the spell transaction.
                </p>
            </div>
        </div>
    );
}
