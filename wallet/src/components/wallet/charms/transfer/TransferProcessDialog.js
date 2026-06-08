'use client';

/**
 * Step 3: Transfer Process Dialog (v10 — background-driven).
 *
 * The actual prove → sign → broadcast pipeline lives in
 * `CharmTransferOperationsContext`, which checkpoints to localStorage at
 * every step so the op survives reloads. This dialog is a thin live view
 * that subscribes to the operation. Closing it does NOT cancel the op —
 * progress keeps streaming into the InTransitPanel and the op auto-resumes
 * on the next unlock if the user kills the tab mid-proof.
 */

import { useEffect, useRef, useMemo } from 'react';
import { useBlockchain } from '@/stores/blockchainStore';
import { getExplorerUrl } from '@/services/charms/sign/broadcastTx';
import { useCharmTransferOperations } from '@/contexts/CharmTransferOperationsContext';
import { CHARM_TRANSFER_PHASE } from '@/services/charm-transfer/persistence';

export default function TransferProcessDialog({ charm, confirmData, onClose }) {
    const { activeNetwork } = useBlockchain();
    const { startCharmTransfer, getOperation } = useCharmTransferOperations();
    const startedRef = useRef(false);

    const {
        selectedCharmUtxos, fundingUtxo, v10Params, inputSigningMap,
        changeAddress, opId, childOpIds = [], isInternalTransfer, feeRate,
    } = confirmData;

    // Dispatch the op to the context once. The context owns the runner +
    // persistence; the dialog only watches the resulting operation.
    useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;
        const label = `Send ${charm.ticker || charm.metadata?.ticker || charm.name || 'Charm'}`;
        startCharmTransfer(label, {
            opId,
            childOpIds,
            isInternalTransfer,
            tokenAppId: v10Params.tokenAppId,
            charmInputs: v10Params.charmInputs,
            transferAmount: v10Params.transferAmount,
            recipientAddress: v10Params.recipientAddress,
            changeAddress: v10Params.changeAddress,
            fundingUtxo,
            inputSigningMap,
            feeRate,
            network: activeNetwork,
            selectedCharmAddresses: (selectedCharmUtxos || []).map(u => u.address).filter(Boolean),
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const op = getOperation(opId);
    const phase = op?.phase || CHARM_TRANSFER_PHASE.QUEUED;
    const statusMsg = op?.statusMessage || '';
    const txId = op?.txid || null;
    const error = op?.error || null;

    const phases = [CHARM_TRANSFER_PHASE.PROVING, CHARM_TRANSFER_PHASE.BROADCASTING, CHARM_TRANSFER_PHASE.COMPLETE];

    const getPhaseIcon = (target) => {
        if (phase === CHARM_TRANSFER_PHASE.ERROR) return '⏳';
        if (phase === target) return (
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary-500" />
        );
        return phases.indexOf(phase) > phases.indexOf(target) ? '✅' : '⏳';
    };

    const isDone = phase === CHARM_TRANSFER_PHASE.COMPLETE;
    const isError = phase === CHARM_TRANSFER_PHASE.ERROR;
    const headerTitle = useMemo(() => {
        if (isDone) return 'Transfer Complete!';
        if (isError) return 'Transfer Failed';
        return 'Processing Transfer…';
    }, [isDone, isError]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="card w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="bg-primary-600 text-white px-6 py-4 flex justify-between items-center">
                    <h3 className="text-lg font-bold">{headerTitle}</h3>
                    <button onClick={onClose} className="text-white hover:text-gray-200" title="Close (transfer keeps running)">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-grow">
                    {isError && (
                        <div className="bg-red-900/30 p-6 rounded-lg border border-red-800 text-center">
                            <div className="text-6xl mb-4">❌</div>
                            <h4 className="text-xl font-bold text-red-400 mb-2">Transfer Failed</h4>
                            <p className="text-red-300">{error}</p>
                        </div>
                    )}

                    {isDone && (
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

                    {!isDone && !isError && (
                        <div className="space-y-4">
                            <div className={`glass-effect p-4 rounded-xl ${phase === CHARM_TRANSFER_PHASE.PROVING ? 'border-2 border-primary-500' : ''}`}>
                                <div className="flex items-center gap-3">
                                    <div className="text-2xl">{getPhaseIcon(CHARM_TRANSFER_PHASE.PROVING)}</div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-white">Generating ZK Proof</h4>
                                        <p className="text-sm text-dark-400">
                                            {phase === CHARM_TRANSFER_PHASE.PROVING
                                                ? (statusMsg || 'This can take 5–10 minutes…')
                                                : (phases.indexOf(phase) > phases.indexOf(CHARM_TRANSFER_PHASE.PROVING) ? 'Proof complete' : 'Queued')}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className={`glass-effect p-4 rounded-xl ${phase === CHARM_TRANSFER_PHASE.BROADCASTING ? 'border-2 border-primary-500' : ''}`}>
                                <div className="flex items-center gap-3">
                                    <div className="text-2xl">{getPhaseIcon(CHARM_TRANSFER_PHASE.BROADCASTING)}</div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-white">Signing & Broadcasting</h4>
                                        <p className="text-sm text-dark-400">
                                            {phase === CHARM_TRANSFER_PHASE.BROADCASTING
                                                ? (statusMsg || 'Signing and sending to Bitcoin network…')
                                                : 'Waiting…'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-blue-900/20 p-4 rounded-lg border border-blue-800/50">
                                <p className="text-sm text-blue-300">
                                    You can close this dialog — the transfer keeps running in the background
                                    and you'll see it in the "In Transit" panel. If the page reloads, it resumes
                                    from where it stopped.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {(isDone || isError) && (
                    <div className="bg-dark-800 px-6 py-4 flex justify-end">
                        <button onClick={onClose} className="btn btn-primary">Close</button>
                    </div>
                )}
            </div>
        </div>
    );
}
