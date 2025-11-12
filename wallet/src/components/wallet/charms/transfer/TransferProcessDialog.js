'use client';

import { useState, useEffect, useRef } from 'react';
import { useWallet } from '@/stores/walletStore';
import { useCharms } from '@/stores/charmsStore';
import { useAddresses } from '@/stores/addressesStore';
import { useBlockchain } from '@/stores/blockchainStore';
import { useWalletSync } from '@/hooks/useWalletSync';
import { proverService } from '@/services/prover';
import { signCommitTransaction } from '@/services/charms/sign/signCommitTx';
import { signSpellTransaction } from '@/services/charms/sign/signSpellTx';
import { broadcastTransactions, getExplorerUrl } from '@/services/charms/sign/broadcastTx';

/**
 * Step 3: Automated Process Dialog
 * - Proving (with spinner)
 * - Signing (with spinner)
 * - Broadcasting (with spinner)
 * - Success (with tx link)
 */
export default function TransferProcessDialog({ 
    charm,
    confirmData, 
    onClose 
}) {
    const [currentPhase, setCurrentPhase] = useState('proving'); // proving, signing, broadcasting, success, error
    const [error, setError] = useState(null);
    const [spellTxId, setSpellTxId] = useState(null);
    const [commitTxId, setCommitTxId] = useState(null);
    const hasStartedRef = useRef(false);

    const { seedPhrase } = useWallet();
    const { updateAfterTransfer, addPendingCharm } = useCharms();
    const { syncAfterCharmTransfer } = useWalletSync();
    const { activeNetwork, activeBlockchain } = useBlockchain();
    const { addresses: walletAddresses } = useAddresses();

    const { selectedCharmUtxos, fundingUtxo, spellJson, changeAddress, inputSigningMap, feeRate } = confirmData;

    const executeTransfer = async () => {
        try {
            // PHASE 1: PROVING
            setCurrentPhase('proving');
            
            const proverResult = await proverService.proveTransfer(
                spellJson,
                fundingUtxo,
                activeNetwork,
                feeRate || 10 // Use dynamic fee rate, fallback to 10 if not provided
            );

            const { commit_tx, spell_tx } = proverResult.transactions;

            // PHASE 2: SIGNING
            setCurrentPhase('signing');
            
            const signedCommit = await signCommitTransaction(
                commit_tx,
                activeNetwork,
                inputSigningMap
            );
            
            const signedSpell = await signSpellTransaction(
                spell_tx,
                commit_tx,
                seedPhrase,
                activeNetwork,
                inputSigningMap
            );

            // PHASE 3: BROADCASTING
            setCurrentPhase('broadcasting');

            const broadcastResult = await broadcastTransactions(
                signedCommit,
                signedSpell,
                activeNetwork
            );

            if (!broadcastResult.success) {
                throw new Error(broadcastResult.error || 'Broadcast failed');
            }

            setCommitTxId(broadcastResult.commitData.txid);
            setSpellTxId(broadcastResult.spellData.txid);
            
            // Parse spell JSON to get transfer details
            const spellData = JSON.parse(spellJson);
            const totalCharmAmount = selectedCharmUtxos.reduce((sum, utxo) => sum + (utxo.amount || utxo.displayAmount || 0), 0);
            const transferAmount = spellData.outs[0]?.charms?.['$01'] || 0;
            const changeAmount = totalCharmAmount - transferAmount;
            
            // Add pending charm for expected change (if any)
            if (changeAmount > 0 && changeAddress) {
                const pendingCharm = {
                    txid: broadcastResult.spellData.txid,
                    outputIndex: 1, // Change is typically output index 1
                    address: changeAddress,
                    amount: changeAmount,
                    appId: charm.appId || selectedCharmUtxos[0]?.appId,
                    name: charm.name || charm.metadata?.name || 'Charm',
                    ticker: charm.ticker || charm.metadata?.ticker || 'CHARM',
                    image: charm.image || charm.metadata?.image,
                    type: 'token',
                    status: 'pending'
                };
                addPendingCharm(pendingCharm);
            }
            
            // Record charm transfer transaction
            const { useTransactionStore } = await import('@/stores/transactionStore');
            const recordSentTransaction = useTransactionStore.getState().recordSentTransaction;
            
            const destinationAddress = spellData.outs[0]?.address || '';
            
            
            // Calculate total BTC spent (fees)
            const totalBtcSpent = (fundingUtxo?.value || 0) + (selectedCharmUtxos.length * 330);
            
            await recordSentTransaction({
                id: `tx_${Date.now()}_charm_${Math.random().toString(36).substr(2, 9)}`,
                txid: broadcastResult.spellData.txid,
                type: 'charm_transfer',
                amount: totalBtcSpent,
                fee: totalBtcSpent,
                timestamp: Date.now(),
                status: 'pending',
                addresses: {
                    from: selectedCharmUtxos.map(u => u.address).filter(Boolean),
                    to: [destinationAddress]
                },
                metadata: {
                    isCharmTransfer: true,
                    charmAmount: transferAmount,
                    charmName: charm.name || charm.metadata?.name || 'Charm',
                    ticker: charm.ticker || charm.metadata?.ticker || 'CHARM'
                }
            }, 'bitcoin', activeNetwork);
            
            
            // Remove spent charm UTXOs from BOTH stores (charms + utxos)
            const { useUTXOStore } = await import('@/stores/utxoStore');
            const updateAfterTransaction = useUTXOStore.getState().updateAfterTransaction;
            
            // Prepare spent UTXOs for removal
            const spentUtxosForRemoval = selectedCharmUtxos.map(utxo => ({
                txid: utxo.txid,
                vout: utxo.outputIndex || utxo.vout,
                address: utxo.address
            }));
            
            // Also include funding UTXO if it was spent
            if (fundingUtxo) {
                spentUtxosForRemoval.push({
                    txid: fundingUtxo.txid,
                    vout: fundingUtxo.vout,
                    address: fundingUtxo.address
                });
            }
            
            // Remove from UTXO store (this will also update balances)
            await updateAfterTransaction(spentUtxosForRemoval, {}, 'bitcoin', activeNetwork);
            
            // Remove from Charms store
            for (const spentUtxo of selectedCharmUtxos) {
                await updateAfterTransfer(spentUtxo);
            }

            // UNIFIED POST-TRANSFER SYNC
            // Sync UTXOs and Charms for all involved addresses
            try {
                const inputAddresses = selectedCharmUtxos
                    .map(utxo => utxo.address)
                    .filter(Boolean);
                
                await syncAfterCharmTransfer({
                    inputAddresses,
                    changeAddress,
                    fundingAddress: fundingUtxo?.address
                });
            } catch (syncError) {
                // Silent fail - data will be refreshed on next page load
            }

            // PHASE 4: SUCCESS
            setCurrentPhase('success');

        } catch (err) {
            setError(err.message);
            setCurrentPhase('error');
        }
    };

    useEffect(() => {
        // Prevent double execution
        if (hasStartedRef.current) {
            return;
        }
        
        hasStartedRef.current = true;
        executeTransfer();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const getPhaseIcon = (phase) => {
        if (currentPhase === phase) {
            if (phase === 'error') {
                return '❌';
            }
            if (phase === 'success') {
                return '✅';
            }
            return '🔄';
        }
        if (phases.indexOf(currentPhase) > phases.indexOf(phase)) {
            return '✅';
        }
        return '⏳';
    };

    const phases = ['proving', 'signing', 'broadcasting', 'success'];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="card w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="bg-primary-600 text-white px-6 py-4 flex justify-between items-center">
                    <h3 className="text-lg font-bold">
                        {currentPhase === 'success' ? 'Transfer Complete!' : 'Processing Transfer...'}
                    </h3>
                    {(currentPhase === 'success' || currentPhase === 'error') && (
                        <button
                            onClick={onClose}
                            className="text-white hover:text-gray-200"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-grow">
                    {/* Error State */}
                    {currentPhase === 'error' && (
                        <div className="space-y-4">
                            <div className="bg-red-900/30 p-6 rounded-lg border border-red-800 text-center">
                                <div className="text-6xl mb-4">❌</div>
                                <h4 className="text-xl font-bold text-red-400 mb-2">Transfer Failed</h4>
                                <p className="text-red-300">{error}</p>
                            </div>
                        </div>
                    )}

                    {/* Success State */}
                    {currentPhase === 'success' && (
                        <div className="space-y-4">
                            <div className="bg-green-900/30 p-6 rounded-lg border border-green-800 text-center">
                                <div className="text-6xl mb-4">✅</div>
                                <h4 className="text-xl font-bold text-green-400 mb-2">Transfer Successful!</h4>
                                <p className="text-green-300 mb-4">Your charm has been transferred successfully.</p>
                                
                                {/* Transaction Links */}
                                <div className="space-y-3 text-left mt-6">
                                    <div>
                                        <p className="text-sm text-dark-400 mb-1">Commit Transaction:</p>
                                        <a
                                            href={getExplorerUrl(commitTxId, activeNetwork)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="font-mono text-xs text-white hover:text-primary-400 underline break-all"
                                        >
                                            {commitTxId}
                                        </a>
                                    </div>
                                    <div>
                                        <p className="text-sm text-dark-400 mb-1">Spell Transaction:</p>
                                        <a
                                            href={getExplorerUrl(spellTxId, activeNetwork)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="font-mono text-xs text-white hover:text-primary-400 underline break-all"
                                        >
                                            {spellTxId}
                                        </a>
                                    </div>
                                </div>

                                <p className="mt-4 text-xs text-green-300">
                                    Click on the transaction IDs to view them on mempool.space
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Processing States */}
                    {currentPhase !== 'success' && currentPhase !== 'error' && (
                        <div className="space-y-4">
                            {/* Step 1: Proving */}
                            <div className={`glass-effect p-4 rounded-xl ${currentPhase === 'proving' ? 'border-2 border-primary-500' : ''}`}>
                                <div className="flex items-center gap-3">
                                    <div className="text-2xl">
                                        {currentPhase === 'proving' ? (
                                            <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary-500"></div>
                                        ) : (
                                            getPhaseIcon('proving')
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-white">Proving Transfer</h4>
                                        <p className="text-sm text-dark-400">
                                            {currentPhase === 'proving' 
                                                ? 'Generating cryptographic proofs...' 
                                                : 'Proof generation complete'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Step 2: Signing */}
                            <div className={`glass-effect p-4 rounded-xl ${currentPhase === 'signing' ? 'border-2 border-primary-500' : ''}`}>
                                <div className="flex items-center gap-3">
                                    <div className="text-2xl">
                                        {currentPhase === 'signing' ? (
                                            <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary-500"></div>
                                        ) : (
                                            getPhaseIcon('signing')
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-white">Signing Transactions</h4>
                                        <p className="text-sm text-dark-400">
                                            {currentPhase === 'signing' 
                                                ? 'Signing commit and spell transactions...' 
                                                : phases.indexOf(currentPhase) > phases.indexOf('signing')
                                                    ? 'Transactions signed'
                                                    : 'Waiting...'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Step 3: Broadcasting */}
                            <div className={`glass-effect p-4 rounded-xl ${currentPhase === 'broadcasting' ? 'border-2 border-primary-500' : ''}`}>
                                <div className="flex items-center gap-3">
                                    <div className="text-2xl">
                                        {currentPhase === 'broadcasting' ? (
                                            <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary-500"></div>
                                        ) : (
                                            getPhaseIcon('broadcasting')
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-white">Broadcasting</h4>
                                        <p className="text-sm text-dark-400">
                                            {currentPhase === 'broadcasting' 
                                                ? 'Broadcasting to Bitcoin network...' 
                                                : phases.indexOf(currentPhase) > phases.indexOf('broadcasting')
                                                    ? 'Broadcast complete'
                                                    : 'Waiting...'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Info */}
                            <div className="bg-blue-900/20 p-4 rounded-lg border border-blue-800/50">
                                <p className="text-sm text-blue-300">
                                    Please wait while we process your transfer. This may take a few moments.
                                    {currentPhase === 'proving' && ' The proving step can take up to 10 minutes.'}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {(currentPhase === 'success' || currentPhase === 'error') && (
                    <div className="bg-dark-800 px-6 py-4 flex justify-end">
                        <button
                            onClick={onClose}
                            className="btn btn-primary"
                        >
                            Close
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
