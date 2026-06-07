'use client';

import { useState, useEffect } from 'react';
import { useCharms } from '@/stores/charmsStore';
import { useUTXOs } from '@/stores/utxoStore';
import { useAddresses } from '@/stores/addressesStore';
import { useBlockchain } from '@/stores/blockchainStore';
import { charmUtxoSelector } from '@/services/charms/utils/charm-utxo-selector';
import { getNetworkFeeRate } from '@/services/shared/fee-rate';
import { reserveForOperation } from '@/services/utxo-reservations';

/**
 * Step 2: Confirmation Dialog
 * - Shows selected UTXOs
 * - Shows funding UTXO
 * - Shows transfer summary
 * - Shows spell JSON (in collapsible section)
 */
export default function TransferConfirmDialog({ 
    charm, 
    transferData, 
    onConfirm, 
    onBack, 
    onClose 
}) {
    const [selectedCharmUtxos, setSelectedCharmUtxos] = useState([]);
    const [fundingUtxo, setFundingUtxo] = useState(null);
    const [v10Params, setV10Params] = useState(null);
    const [activeTab, setActiveTab] = useState('details'); // 'details' or 'spell'
    const [error, setError] = useState(null);
    const [feeRate, setFeeRate] = useState(null);
    const [estimatedFees, setEstimatedFees] = useState(null);

    const { charms, isCharmNFT, isCharmToken } = useCharms();
    const { utxos } = useUTXOs();
    const { addresses } = useAddresses();
    const { activeNetwork } = useBlockchain();

    const isNFT = isCharmNFT(charm);
    const isToken = isCharmToken(charm);

    const { destinationAddress, transferAmount, displayAmount } = transferData;

    // Calculate change
    const totalSelected = selectedCharmUtxos.reduce(
        (sum, utxo) => sum + charmUtxoSelector.getUtxoAmount(utxo),
        0
    );
    const change = totalSelected - transferAmount;
    const hasChange = change > 0;

    // Get change address (index 0, external address)
    const changeAddress = addresses.find(addr => addr.index === 0 && !addr.isChange)?.address;

    useEffect(() => {
        async function prepareFees() {
            try {
                setError(null);

                // Get dynamic fee rate (halfHour × 1.1, same criterion as charms-cast)
                const networkFeeRate = await getNetworkFeeRate(activeNetwork);
                setFeeRate(networkFeeRate);

            // Validate change address
            if (!changeAddress) {
                throw new Error('Unable to get change address (index 0). Please ensure wallet is properly initialized.');
            }

            // Step 1: Select charm UTXOs
            let charmUtxosToUse = [];
            
            if (isNFT) {
                // NFT: use the single charm UTXO
                charmUtxosToUse = [charm];
            } else {
                // Token: select UTXOs to reach amount
                // Use allUtxos if provided (from grouped tokens), otherwise get from store
                const allCharmUtxos = charm.allUtxos || charms.filter(c => c.appId === charm.appId);
                
                if (allCharmUtxos.length === 1) {
                    // Single UTXO case
                    charmUtxosToUse = [allCharmUtxos[0]];
                } else {
                    // Multi-UTXO case: use selector
                    const selection = charmUtxoSelector.selectCharmUtxosForAmount(
                        allCharmUtxos,
                        charm.appId,
                        transferAmount
                    );
                    charmUtxosToUse = selection.selectedUtxos;
                }
            }

            setSelectedCharmUtxos(charmUtxosToUse);

            // Step 2: Estimate fees — v10 single TX
            // - Base overhead: ~10 bytes
            // - Each P2TR input: ~180 bytes
            // - Each P2TR output: ~43 bytes
            const numCharmInputs = charmUtxosToUse.length;
            const numOutputs = hasChange ? 3 : 2; // recipient + change (if any) + OP_RETURN proof
            const estimatedSize = 10 + 180 * (numCharmInputs + 1) + 43 * numOutputs;
            const calculatedFees = Math.ceil(estimatedSize * networkFeeRate);
            setEstimatedFees(calculatedFees);
            
            // Add 20% safety margin
            const requiredFundingSats = Math.ceil(calculatedFees * 1.2);

            // CRITICAL: Filter out reserved UTXOs (charms, ordinals, runes) before selecting funding UTXO
            const { utxoCalculations } = await import('@/services/utxo/utils/calculations');
            const spendableUtxos = utxoCalculations.getSpendableUtxos(utxos, charms);

            // Find funding UTXO (Bitcoin) - select the largest spendable one with sufficient funds
            let selectedFundingUtxo = null;
            let maxValue = 0;

            for (const [address, addressUtxos] of Object.entries(spendableUtxos)) {
                for (const utxo of addressUtxos) {
                    // Always select the biggest UTXO that meets the minimum requirement
                    if (utxo.value > maxValue && utxo.value >= requiredFundingSats) {
                        maxValue = utxo.value;
                        selectedFundingUtxo = {
                            txid: utxo.txid,
                            vout: utxo.vout,
                            value: utxo.value,
                            address
                        };
                    }
                }
            }

            if (!selectedFundingUtxo) {
                throw new Error(
                    `No suitable funding UTXO found.\n\n` +
                    `Required: ${requiredFundingSats} sats (estimated fees: ${calculatedFees} sats + 20% margin)\n` +
                    `Fee rate: ${networkFeeRate} sat/vB\n\n` +
                    `Please ensure you have a Bitcoin UTXO with at least ${requiredFundingSats} sats to cover transaction fees.`
                );
            }

            setFundingUtxo(selectedFundingUtxo);

            // Step 3: Build v10 transfer params
            setV10Params({
                tokenAppId: charm.appId,
                charmInputs: charmUtxosToUse.map(u => ({
                    utxoId: `${u.txid}:${u.outputIndex}`,
                    amount: u.amount,
                })),
                transferAmount,
                recipientAddress: destinationAddress,
                changeAddress,
            });

            } catch (err) {
                setError(err.message);
                console.error('Error preparing transfer:', err);
            }
        }
        
        prepareFees();
    }, [charm, charms, transferAmount, destinationAddress, utxos, isNFT, isToken, changeAddress, activeNetwork]);

    const handleConfirm = () => {
        if (!fundingUtxo || !v10Params || selectedCharmUtxos.length === 0) {
            return;
        }

        // Build input signing map: "txid:vout" → { address, index, isChange }
        const inputSigningMap = {};

        for (const utxo of selectedCharmUtxos) {
            const key = `${utxo.txid}:${utxo.outputIndex}`;
            const entry = addresses.find(a => a.address === utxo.address);
            inputSigningMap[key] = {
                address: utxo.address,
                index: entry?.index || 0,
                isChange: entry?.isChange || false,
            };
        }

        const fundingKey = `${fundingUtxo.txid}:${fundingUtxo.vout}`;
        const fundingEntry = addresses.find(a => a.address === fundingUtxo.address);
        inputSigningMap[fundingKey] = {
            address: fundingUtxo.address,
            index: fundingEntry?.index || 0,
            isChange: fundingEntry?.isChange || false,
        };

        // Lock the selected UTXOs against concurrent operations for the
        // ~5–10 min duration of the proof. The process dialog releases the
        // op on failure so the funds are reusable; on success the executor
        // marks the inputs as spent before the network reflects it.
        const opId = `charm-transfer:${fundingUtxo.txid}:${fundingUtxo.vout}:${Date.now()}`;
        const reservationItems = [
            ...selectedCharmUtxos.map(u => ({ txid: u.txid, vout: u.outputIndex })),
            { txid: fundingUtxo.txid, vout: fundingUtxo.vout },
        ];
        try {
            reserveForOperation(opId, 'bitcoin', reservationItems, 'Charm Transfer');
        } catch (e) {
            console.error('[TransferConfirmDialog] reserveForOperation failed:', e);
        }

        onConfirm({
            selectedCharmUtxos,
            fundingUtxo: { utxoId: `${fundingUtxo.txid}:${fundingUtxo.vout}`, value: fundingUtxo.value, address: fundingUtxo.address },
            v10Params,
            changeAddress,
            inputSigningMap,
            feeRate,
            opId,
        });
    };

    const ticker = charm.ticker || charm.metadata?.ticker || '';
    const decimals = charm.decimals || 8;
    const displayTransferAmount = transferAmount / Math.pow(10, decimals);
    const displayChangeAmount = change / Math.pow(10, decimals);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="card w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="bg-primary-600 text-white px-6 py-4 flex justify-between items-center">
                    <h3 className="text-lg font-bold">Confirm Transfer</h3>
                    <button
                        onClick={onClose}
                        className="text-white hover:text-gray-200"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-grow space-y-4">
                    {error && (
                        <div className="bg-red-900/30 p-4 rounded-lg border border-red-800 text-red-400">
                            <h5 className="font-medium mb-2">Error</h5>
                            <p className="text-sm">{error}</p>
                        </div>
                    )}

                    {/* Transfer Summary */}
                    <div className="glass-effect p-4 rounded-xl">
                        <h4 className="font-bold text-white mb-3">Transfer Summary</h4>
                        <div className="space-y-3 text-sm">
                            <div className="grid grid-cols-[120px_1fr] gap-2 items-start">
                                <span className="text-dark-400">Destination:</span>
                                <span className="font-mono text-white text-xs break-all">
                                    {destinationAddress}
                                </span>
                            </div>
                            <div className="grid grid-cols-[120px_1fr] gap-2">
                                <span className="text-dark-400">Amount to Send:</span>
                                <span className="font-bold text-bitcoin-400">
                                    {displayTransferAmount} {ticker}
                                </span>
                            </div>
                            {hasChange && (
                                <div className="grid grid-cols-[120px_1fr] gap-2">
                                    <span className="text-dark-400">Change:</span>
                                    <span className="text-white">
                                        {displayChangeAmount} {ticker}
                                    </span>
                                </div>
                            )}
                            {hasChange && (
                                <div className="grid grid-cols-[120px_1fr] gap-2 items-start">
                                    <span className="text-dark-400">Change Address:</span>
                                    <span className="font-mono text-white text-xs break-all">
                                        {changeAddress}
                                    </span>
                                </div>
                            )}
                            <div className="border-t border-dark-700 pt-3 mt-3">
                                <div className="grid grid-cols-[120px_1fr] gap-2">
                                    <span className="text-dark-400">Fee Rate:</span>
                                    <span className="text-white">
                                        {feeRate ? `${feeRate} sat/vB` : 'Calculating...'}
                                    </span>
                                </div>
                                <div className="grid grid-cols-[120px_1fr] gap-2 mt-2">
                                    <span className="text-dark-400">Estimated Fee:</span>
                                    <span className="text-orange-400 font-bold">
                                        {estimatedFees ? `${estimatedFees} sats` : 'Calculating...'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-2 border-b border-dark-700">
                        <button
                            onClick={() => setActiveTab('details')}
                            className={`px-4 py-2 font-medium transition-colors ${
                                activeTab === 'details'
                                    ? 'text-primary-400 border-b-2 border-primary-400'
                                    : 'text-dark-400 hover:text-white'
                            }`}
                        >
                            Details
                        </button>
                        <button
                            onClick={() => setActiveTab('spell')}
                            className={`px-4 py-2 font-medium transition-colors ${
                                activeTab === 'spell'
                                    ? 'text-primary-400 border-b-2 border-primary-400'
                                    : 'text-dark-400 hover:text-white'
                            }`}
                        >
                            Spell JSON
                        </button>
                    </div>

                    {/* Tab Content */}
                    {activeTab === 'details' && (
                        <div className="space-y-4">
                            {/* Selected Charm UTXOs */}
                            {/* [RJJ-16] - Temporary: Show UTXO count with limit info */}
                            <div className="glass-effect p-4 rounded-xl">
                                <h4 className="font-bold text-white mb-3">
                                    Selected Charm UTXOs ({selectedCharmUtxos.length}/16 max)
                                </h4>
                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                    {selectedCharmUtxos.map((utxo, index) => (
                                        <div key={index} className="bg-dark-800 p-3 rounded-lg text-xs">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-dark-400">UTXO #{index + 1}</span>
                                                <span className="text-bitcoin-400 font-bold">
                                                    {charmUtxoSelector.getUtxoAmount(utxo) / Math.pow(10, decimals)} {ticker}
                                                </span>
                                            </div>
                                            <div className="font-mono text-dark-300 break-all">
                                                {utxo.txid}:{utxo.outputIndex}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Funding UTXO */}
                            {fundingUtxo && (
                                <div className="glass-effect p-4 rounded-xl">
                                    <h4 className="font-bold text-white mb-3">Funding UTXO (Bitcoin)</h4>
                                    <div className="bg-dark-800 p-3 rounded-lg text-xs">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-dark-400">Amount:</span>
                                            <span className="text-white font-bold">{fundingUtxo.value} sats</span>
                                        </div>
                                        <div className="font-mono text-dark-300 break-all">
                                            {fundingUtxo.txid}:{fundingUtxo.vout}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Transfer Params Tab */}
                    {activeTab === 'spell' && v10Params && (
                        <div className="glass-effect p-4 rounded-xl h-full">
                            <h4 className="font-bold text-white mb-3">Transfer Params (v10)</h4>
                            <pre className="bg-dark-800 p-4 rounded-lg text-xs text-green-400 overflow-x-auto h-[calc(100%-3rem)] overflow-y-auto">
                                {JSON.stringify(v10Params, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="bg-dark-800 px-6 py-4 flex justify-between">
                    <button
                        onClick={onBack}
                        className="btn btn-secondary"
                    >
                        Back
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!fundingUtxo || !v10Params || selectedCharmUtxos.length === 0 || !!error}
                        className={`btn ${!fundingUtxo || !v10Params || selectedCharmUtxos.length === 0 || !!error
                            ? 'bg-dark-600 cursor-not-allowed text-dark-400'
                            : 'btn-primary'
                            }`}
                    >
                        Confirm Transfer
                    </button>
                </div>
            </div>
        </div>
    );
}
