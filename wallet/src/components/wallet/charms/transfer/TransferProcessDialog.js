'use client';

import { useState, useEffect, useRef } from 'react';
import { useWallet } from '@/stores/walletStore';
import { useCharms } from '@/stores/charmsStore';
import { useAddresses } from '@/stores/addressesStore';
import { useBlockchain } from '@/stores/blockchainStore';
import { useWalletSync } from '@/hooks/useWalletSync';
import { proveCharmTransfer, signAndBroadcastTransfer } from '@/services/charm-transfer';
import { getExplorerUrl } from '@/services/charms/sign/broadcastTx';

/**
 * Step 3: Transfer Process Dialog (v10 — single TX)
 * Phases: proving → broadcasting → success
 */
export default function TransferProcessDialog({
    charm,
    confirmData,
    onClose
}) {
    const [currentPhase, setCurrentPhase] = useState('proving');
    const [statusMsg, setStatusMsg] = useState('');
    const [error, setError] = useState(null);
    const [txId, setTxId] = useState(null);
    const hasStartedRef = useRef(false);

    const { seedPhrase } = useWallet();
    // Capture seed via ref so the long-running async transfer reads the
    // latest value, not a stale render-time closure.
    const seedRef = useRef(seedPhrase);
    useEffect(() => { seedRef.current = seedPhrase; }, [seedPhrase]);

    const { updateAfterTransfer, addPendingCharm } = useCharms();
    const { syncAfterCharmTransfer, syncFullWallet } = useWalletSync();
    const { activeNetwork } = useBlockchain();
    const { addresses: walletAddresses } = useAddresses();

    const { selectedCharmUtxos, fundingUtxo, v10Params, changeAddress, inputSigningMap } = confirmData;

    const executeTransfer = async () => {
        try {
            // ── Phase 1: Prove ────────────────────────────────────────────
            setCurrentPhase('proving');

            const { spellTxHex, prevTxMap, fee } = await proveCharmTransfer({
                tokenAppId: v10Params.tokenAppId,
                charmInputs: v10Params.charmInputs,
                fundingUtxo,
                transferAmount: v10Params.transferAmount,
                recipientAddress: v10Params.recipientAddress,
                changeAddress: v10Params.changeAddress,
                network: activeNetwork,
                onStatus: setStatusMsg,
            });

            // ── Phase 2: Sign + Broadcast ─────────────────────────────────
            setCurrentPhase('broadcasting');

            const { txid } = await signAndBroadcastTransfer({
                spellTxHex,
                prevTxMap,
                inputSigningMap,
                seedPhrase: seedRef.current,
                network: activeNetwork,
                onStatus: setStatusMsg,
            });

            setTxId(txid);

            // ── Post-transfer: update local state ─────────────────────────

            const walletAddressSet = new Set(walletAddresses.map(a => a.address));
            const isInternalTransfer = walletAddressSet.has(v10Params.recipientAddress);

            // Add pending charm for change output if not internal
            if (v10Params.changeAddress && !isInternalTransfer) {
                const remainingTokens = v10Params.charmInputs.reduce((s, i) => s + i.amount, 0) - v10Params.transferAmount;
                if (remainingTokens > 0) {
                    addPendingCharm({
                        txid,
                        outputIndex: 1,
                        address: v10Params.changeAddress,
                        amount: remainingTokens,
                        appId: v10Params.tokenAppId,
                        name: charm.name || charm.metadata?.name || 'Charm',
                        ticker: charm.ticker || charm.metadata?.ticker || 'CHARM',
                        image: charm.image || charm.metadata?.image,
                        type: 'token',
                        status: 'pending',
                    });
                }
            }

            // Record transaction
            const { useTransactionStore } = await import('@/stores/transactionStore');
            const recordSentTransaction = useTransactionStore.getState().recordSentTransaction;
            await recordSentTransaction({
                id: `tx_${Date.now()}_charm_${Math.random().toString(36).substr(2, 9)}`,
                txid,
                type: 'charm_transfer',
                amount: fee || 0,
                fee: fee || 0,
                timestamp: Date.now(),
                status: 'pending',
                addresses: {
                    from: selectedCharmUtxos.map(u => u.address).filter(Boolean),
                    to: [v10Params.recipientAddress],
                },
                metadata: {
                    isCharmTransfer: true,
                    isInternalTransfer,
                    charmAmount: v10Params.transferAmount,
                    charmName: charm.name || charm.metadata?.name || 'Charm',
                    ticker: charm.ticker || charm.metadata?.ticker || 'CHARM',
                },
            }, 'bitcoin', activeNetwork);

            // Remove spent UTXOs from stores
            const { useUTXOStore } = await import('@/stores/utxoStore');
            const updateAfterTransaction = useUTXOStore.getState().updateAfterTransaction;
            const fundingTxid = fundingUtxo?.utxoId?.split(':')[0];
            const fundingVout = parseInt(fundingUtxo?.utxoId?.split(':')[1] || '0');
            const spentUtxos = [
                ...selectedCharmUtxos.map(u => ({ txid: u.txid, vout: u.outputIndex ?? u.vout, address: u.address })),
                ...(fundingTxid ? [{ txid: fundingTxid, vout: fundingVout, address: fundingUtxo.address }] : []),
            ];
            await updateAfterTransaction(spentUtxos, {}, 'bitcoin', activeNetwork);

            for (const u of selectedCharmUtxos) {
                await updateAfterTransfer(u);
            }

            // Sync wallet
            try {
                await syncAfterCharmTransfer({
                    inputAddresses: selectedCharmUtxos.map(u => u.address).filter(Boolean),
                    changeAddress: v10Params.changeAddress,
                    fundingAddress: fundingUtxo?.address,
                });
                await syncFullWallet();
            } catch (_) { /* silent */ }

            setCurrentPhase('success');

        } catch (err) {
            setError(err.message);
            setCurrentPhase('error');
        }
    };

    useEffect(() => {
        if (hasStartedRef.current) return;
        hasStartedRef.current = true;
        executeTransfer();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const phases = ['proving', 'broadcasting', 'success'];

    const getPhaseIcon = (phase) => {
        if (currentPhase === 'error') return '⏳';
        if (currentPhase === phase) return (
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary-500" />
        );
        return phases.indexOf(currentPhase) > phases.indexOf(phase) ? '✅' : '⏳';
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="card w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="bg-primary-600 text-white px-6 py-4 flex justify-between items-center">
                    <h3 className="text-lg font-bold">
                        {currentPhase === 'success' ? 'Transfer Complete!' : 'Processing Transfer...'}
                    </h3>
                    {(currentPhase === 'success' || currentPhase === 'error') && (
                        <button onClick={onClose} className="text-white hover:text-gray-200">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-grow">
                    {currentPhase === 'error' && (
                        <div className="bg-red-900/30 p-6 rounded-lg border border-red-800 text-center">
                            <div className="text-6xl mb-4">❌</div>
                            <h4 className="text-xl font-bold text-red-400 mb-2">Transfer Failed</h4>
                            <p className="text-red-300">{error}</p>
                        </div>
                    )}

                    {currentPhase === 'success' && (
                        <div className="bg-green-900/30 p-6 rounded-lg border border-green-800 text-center">
                            <div className="text-6xl mb-4">✅</div>
                            <h4 className="text-xl font-bold text-green-400 mb-2">Transfer Successful!</h4>
                            <p className="text-green-300 mb-4">Your charm has been transferred.</p>
                            <div className="text-left mt-4">
                                <p className="text-sm text-dark-400 mb-1">Transaction:</p>
                                <a
                                    href={getExplorerUrl(txId, activeNetwork)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono text-xs text-white hover:text-primary-400 underline break-all"
                                >
                                    {txId}
                                </a>
                            </div>
                        </div>
                    )}

                    {currentPhase !== 'success' && currentPhase !== 'error' && (
                        <div className="space-y-4">
                            {/* Proving */}
                            <div className={`glass-effect p-4 rounded-xl ${currentPhase === 'proving' ? 'border-2 border-primary-500' : ''}`}>
                                <div className="flex items-center gap-3">
                                    <div className="text-2xl">{getPhaseIcon('proving')}</div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-white">Generating ZK Proof</h4>
                                        <p className="text-sm text-dark-400">
                                            {currentPhase === 'proving'
                                                ? (statusMsg || 'This can take 5–10 minutes...')
                                                : 'Proof complete'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Sign + Broadcast */}
                            <div className={`glass-effect p-4 rounded-xl ${currentPhase === 'broadcasting' ? 'border-2 border-primary-500' : ''}`}>
                                <div className="flex items-center gap-3">
                                    <div className="text-2xl">{getPhaseIcon('broadcasting')}</div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-white">Signing & Broadcasting</h4>
                                        <p className="text-sm text-dark-400">
                                            {currentPhase === 'broadcasting'
                                                ? (statusMsg || 'Signing and sending to Bitcoin network...')
                                                : 'Waiting...'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-blue-900/20 p-4 rounded-lg border border-blue-800/50">
                                <p className="text-sm text-blue-300">
                                    Please wait. The ZK proof step can take up to 10 minutes.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {(currentPhase === 'success' || currentPhase === 'error') && (
                    <div className="bg-dark-800 px-6 py-4 flex justify-end">
                        <button onClick={onClose} className="btn btn-primary">Close</button>
                    </div>
                )}
            </div>
        </div>
    );
}
