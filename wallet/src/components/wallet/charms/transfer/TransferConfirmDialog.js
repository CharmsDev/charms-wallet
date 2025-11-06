'use client';

import { useState, useEffect } from 'react';
import { useCharms } from '@/stores/charmsStore';
import { useUTXOs } from '@/stores/utxoStore';
import { useAddresses } from '@/stores/addressesStore';
import { useBlockchain } from '@/stores/blockchainStore';
import { charmUtxoSelector } from '@/services/charms/utils/charm-utxo-selector';
import { charmsSpellService } from '@/services/charms/spell-composer';
import { MIN_FUNDING_UTXO_SATS } from '@/services/charms/utils/charm-constants';

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
    const [spellJson, setSpellJson] = useState('');
    const [activeTab, setActiveTab] = useState('details'); // 'details' or 'spell'
    const [error, setError] = useState(null);

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
        try {
            setError(null);

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

            // Step 2: Estimate fees BEFORE selecting funding UTXO
            // Fee rate in sat/vB
            const FEE_RATE = 10;
            
            // Estimate transaction size:
            // - Base tx overhead: ~10 bytes
            // - Each input: ~180 bytes (P2TR with witness)
            // - Each output: ~43 bytes (P2TR)
            // Commit tx: 1 funding input + 1 output = ~233 bytes
            // Spell tx: N charm inputs + 1 funding input + outputs = ~(180*N + 180 + 43*outputs)
            const numCharmInputs = charmUtxosToUse.length;
            const estimatedCommitSize = 233; // bytes
            const estimatedSpellSize = 180 * numCharmInputs + 180 + 43 * 3; // 3 outputs typical
            const totalEstimatedSize = estimatedCommitSize + estimatedSpellSize;
            const estimatedFees = Math.ceil(totalEstimatedSize * FEE_RATE);
            
            // Add 20% safety margin
            const requiredFundingSats = Math.ceil(estimatedFees * 1.2);
            
            console.log('💰 [TransferConfirm] Fee estimation:');
            console.log(`   └─ Fee rate: ${FEE_RATE} sat/vB`);
            console.log(`   └─ Charm inputs: ${numCharmInputs}`);
            console.log(`   └─ Estimated commit tx size: ${estimatedCommitSize} bytes`);
            console.log(`   └─ Estimated spell tx size: ${estimatedSpellSize} bytes`);
            console.log(`   └─ Total estimated size: ${totalEstimatedSize} bytes`);
            console.log(`   └─ Estimated fees: ${estimatedFees} sats`);
            console.log(`   └─ Required funding (with 20% margin): ${requiredFundingSats} sats`);

            // Step 3: Find funding UTXO (Bitcoin) - always select the biggest one with sufficient funds
            let selectedFundingUtxo = null;
            let maxValue = 0;

            console.log('🔐 [TransferConfirm] Searching for funding UTXO...');
            console.log('🔐 [TransferConfirm] Available UTXO addresses:', Object.keys(utxos));

            for (const [address, addressUtxos] of Object.entries(utxos)) {
                for (const utxo of addressUtxos) {
                    // Always select the biggest UTXO that meets the minimum requirement
                    if (utxo.value > maxValue && utxo.value >= requiredFundingSats) {
                        maxValue = utxo.value;
                        selectedFundingUtxo = {
                            txid: utxo.txid,
                            vout: utxo.vout,
                            value: utxo.value,
                            address  // This comes from the utxos object key
                        };
                        console.log(`🔐 [TransferConfirm] Candidate funding UTXO: ${utxo.txid}:${utxo.vout} from address: ${address}, value: ${utxo.value} sats`);
                    }
                }
            }
            
            if (selectedFundingUtxo) {
                console.log(`✅ [TransferConfirm] Selected LARGEST funding UTXO: ${selectedFundingUtxo.txid}:${selectedFundingUtxo.vout}, value: ${selectedFundingUtxo.value} sats`);
            }

            if (!selectedFundingUtxo) {
                throw new Error(
                    `No suitable funding UTXO found.\n\n` +
                    `Required: ${requiredFundingSats} sats (estimated fees: ${estimatedFees} sats + 20% margin)\n` +
                    `Fee rate: ${FEE_RATE} sat/vB\n\n` +
                    `Please ensure you have a Bitcoin UTXO with at least ${requiredFundingSats} sats to cover transaction fees.`
                );
            }

            setFundingUtxo(selectedFundingUtxo);

            // Step 3: Generate spell JSON
            let spell;
            
            if (isNFT) {
                spell = charmsSpellService.composeNFTTransfer(charm, destinationAddress);
            } else if (charmUtxosToUse.length === 1) {
                // Single UTXO token transfer
                spell = charmsSpellService.composeTransferSpell(
                    charmUtxosToUse[0],
                    transferAmount,
                    destinationAddress
                );
            } else {
                // Multi-UTXO token transfer
                spell = charmsSpellService.composeTokenMultiInputTransfer(
                    charmUtxosToUse,
                    transferAmount,
                    destinationAddress,
                    changeAddress
                );
            }

            setSpellJson(spell);

        } catch (err) {
            setError(err.message);
            console.error('Error preparing transfer:', err);
        }
    }, [charm, charms, transferAmount, destinationAddress, utxos, isNFT, isToken, changeAddress]);

    const handleConfirm = () => {
        if (!fundingUtxo || !spellJson || selectedCharmUtxos.length === 0) {
            return;
        }

        // Create input signing map: txid:vout -> addressInfo
        const inputSigningMap = {};
        
        console.log('🔐 [TransferConfirm] Creating inputSigningMap...');
        
        // Add charm UTXOs to map
        for (const utxo of selectedCharmUtxos) {
            const key = `${utxo.txid}:${utxo.outputIndex}`;
            const addressEntry = addresses.find(addr => addr.address === utxo.address);
            inputSigningMap[key] = {
                address: utxo.address,
                index: addressEntry?.index || 0,
                isChange: addressEntry?.isChange || false
            };
            console.log(`🔐 [TransferConfirm] Added charm UTXO: ${key} -> ${utxo.address}`);
        }
        
        // Add funding UTXO to map
        if (fundingUtxo) {
            const key = `${fundingUtxo.txid}:${fundingUtxo.vout}`;
            const addressEntry = addresses.find(addr => addr.address === fundingUtxo.address);
            
            console.log(`🔐 [TransferConfirm] Funding UTXO address: ${fundingUtxo.address}`);
            console.log(`🔐 [TransferConfirm] Address found in wallet:`, addressEntry);
            
            if (!addressEntry) {
                console.error(`🔐 [TransferConfirm] ⚠️ WARNING: Funding UTXO address NOT FOUND in wallet addresses!`);
                console.log(`🔐 [TransferConfirm] Available addresses:`, addresses.map(a => a.address));
            }
            
            inputSigningMap[key] = {
                address: fundingUtxo.address,
                index: addressEntry?.index || 0,
                isChange: addressEntry?.isChange || false
            };
            console.log(`🔐 [TransferConfirm] Added funding UTXO: ${key} -> ${fundingUtxo.address} (index: ${addressEntry?.index || 0})`);
        }
        
        console.log('🔐 [TransferConfirm] inputSigningMap complete:', inputSigningMap);
        console.log('🔐 [TransferConfirm] inputSigningMap details:');
        Object.entries(inputSigningMap).forEach(([key, value]) => {
            console.log(`  ${key} -> address: ${value.address}, index: ${value.index}, isChange: ${value.isChange}`);
        });

        onConfirm({
            selectedCharmUtxos,
            fundingUtxo,
            spellJson,
            changeAddress,
            inputSigningMap  // NEW: Map of inputs to sign
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
                            <div className="glass-effect p-4 rounded-xl">
                                <h4 className="font-bold text-white mb-3">
                                    Selected Charm UTXOs ({selectedCharmUtxos.length})
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

                    {/* Spell JSON Tab */}
                    {activeTab === 'spell' && spellJson && (
                        <div className="glass-effect p-4 rounded-xl h-full">
                            <h4 className="font-bold text-white mb-3">Spell JSON</h4>
                            <pre className="bg-dark-800 p-4 rounded-lg text-xs text-green-400 overflow-x-auto h-[calc(100%-3rem)] overflow-y-auto">
                                {spellJson}
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
                        disabled={!fundingUtxo || !spellJson || selectedCharmUtxos.length === 0 || !!error}
                        className={`btn ${!fundingUtxo || !spellJson || selectedCharmUtxos.length === 0 || !!error
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
