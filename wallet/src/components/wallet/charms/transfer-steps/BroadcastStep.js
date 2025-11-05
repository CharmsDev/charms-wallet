'use client';

import { useState } from 'react';
import { useCharms } from '@/stores/charmsStore';
import { useBlockchain } from '@/stores/blockchainStore';
import { useUTXOs } from '@/stores/utxoStore';
import { useWallet } from '@/stores/walletStore';
import { broadcastTransactions, getExplorerUrl } from '@/services/charms/sign/broadcastTx';

export default function BroadcastStep({
    signedCommitTx,
    signedSpellTx,
    addLogMessage,
    charm,
    commitTxHex,
    spellTxHex,
    onBroadcastSuccess
}) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [broadcastResult, setBroadcastResult] = useState(null);
    const { updateAfterTransfer } = useCharms();
    const { refreshSpecificAddresses } = useUTXOs();
    const { activeNetwork, activeBlockchain } = useBlockchain();
    const { getAddressAtIndex } = useWallet();

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
                activeNetwork,
                addLogMessage
            );

            // Store the result
            setBroadcastResult({
                commitTxId: result.commitData.txid,
                spellTxId: result.spellData.txid
            });

            addLogMessage('Updating local state...');

            // 1. Remove transferred charm from cache
            await updateAfterTransfer(charm);
            addLogMessage('✅ Charm removed from local cache');

            // 2. Refresh UTXOs for involved addresses
            // Scan the charm's address (source) and destination address
            addLogMessage('Refreshing UTXOs for involved addresses...');
            addLogMessage(`📍 Charm address: ${charm.address || 'NOT FOUND'}`);
            addLogMessage(`📍 Charm addressIndex: ${charm.addressIndex !== undefined ? charm.addressIndex : 'NOT FOUND'}`);
            addLogMessage(`📍 Charm UTXO: ${charm.txid}:${charm.outputIndex}`);
            
            try {
                // Get addresses to scan:
                // - Charm's address (where it was)
                // - Destination address (where it's going)
                const addressesToScan = new Set();
                
                // Add charm's address
                if (charm.address) {
                    addressesToScan.add(charm.address);
                    addLogMessage(`✅ Added charm address: ${charm.address}`);
                }
                
                // Add destination address from spell transaction
                // The destination is in the transfer details
                // We'll scan a few addresses around the charm's index to catch change outputs
                if (charm.addressIndex !== undefined) {
                    // Scan the charm's address and a few around it for change
                    const startIndex = Math.max(0, charm.addressIndex - 2);
                    const endIndex = charm.addressIndex + 5;
                    addLogMessage(`🔍 Scanning address indices ${startIndex} to ${endIndex}`);
                    
                    for (let i = startIndex; i <= endIndex; i++) {
                        const addr = getAddressAtIndex(i, activeNetwork);
                        if (addr) {
                            addressesToScan.add(addr);
                            addLogMessage(`  - Index ${i}: ${addr}`);
                        }
                    }
                }
                
                const addressArray = Array.from(addressesToScan);
                addLogMessage(`📡 Scanning ${addressArray.length} addresses for updated UTXOs...`);
                addLogMessage(`Addresses: ${JSON.stringify(addressArray, null, 2)}`);
                
                // Refresh only these specific addresses
                const result = await refreshSpecificAddresses(addressArray, activeBlockchain, activeNetwork);
                
                addLogMessage(`✅ UTXOs refreshed successfully`);
                addLogMessage(`Result: ${JSON.stringify(result ? Object.keys(result) : 'null', null, 2)}`);
            } catch (utxoError) {
                addLogMessage('⚠️ UTXO refresh failed: ' + utxoError.message);
                addLogMessage(`Error stack: ${utxoError.stack}`);
            }

            addLogMessage('✅ Transfer completed successfully!');
            addLogMessage('Your wallet has been updated with the latest state.');

            // Notify parent component that broadcast was successful
            if (onBroadcastSuccess) {
                onBroadcastSuccess();
            }
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
                        <h5 className="font-medium mb-3">Transfer Successful!</h5>
                        <div className="space-y-3 text-sm">
                            <div>
                                <p className="font-medium mb-1">Commit Transaction:</p>
                                <a 
                                    href={getExplorerUrl(broadcastResult.commitTxId, activeNetwork)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono break-all text-white hover:text-primary-400 underline"
                                >
                                    {broadcastResult.commitTxId}
                                </a>
                            </div>
                            <div>
                                <p className="font-medium mb-1">Spell Transaction:</p>
                                <a 
                                    href={getExplorerUrl(broadcastResult.spellTxId, activeNetwork)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono break-all text-white hover:text-primary-400 underline"
                                >
                                    {broadcastResult.spellTxId}
                                </a>
                            </div>
                            <p className="mt-4 text-xs text-green-300">
                                Click on the transaction IDs above to view them on mempool.space
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
                    Broadcasting the transactions finalizes the transfer of your charm.
                </p>
            </div>
        </div>
    );
}
