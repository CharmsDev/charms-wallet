'use client';

import { useState, useEffect } from 'react';
import { useUTXOs } from '@/stores/utxoStore';
import { useAddresses } from '@/stores/addressesStore';
import { useBlockchain } from '@/stores/blockchainStore';
import { useWallet } from '@/stores/walletStore';
import config from '@/config';
import utxoManager from '@/services/wallet/utxo-manager';
import SendBitcoinDialog from './SendBitcoinDialog';

export default function UTXOList() {
    const {
        utxos,
        isLoading,
        error,
        totalBalance,
        refreshProgress,
        loadUTXOs,
        refreshUTXOs,
        updateAfterTransaction,
        formatValue,
        initialized,
        cancelUTXORefresh
    } = useUTXOs();
    const { addresses, loadAddresses } = useAddresses();
    const { activeBlockchain, activeNetwork, isBitcoin, isCardano } = useBlockchain();
    const { seedPhrase } = useWallet();
    const [flattenedUtxos, setFlattenedUtxos] = useState([]);
    const [isSendDialogOpen, setIsSendDialogOpen] = useState(false);
    const [confirmedUtxos, setConfirmedUtxos] = useState([]);

    // Load addresses when component mounts - CRITICAL for UTXO loading to work
    useEffect(() => {
        if (seedPhrase && activeBlockchain && activeNetwork) {
            loadAddresses(seedPhrase, activeBlockchain, activeNetwork);
        }
    }, [seedPhrase, activeBlockchain, activeNetwork, loadAddresses]);

    // Load UTXOs from localStorage when addresses are available
    useEffect(() => {
        if (addresses.length > 0) {
            loadUTXOs(activeBlockchain, activeNetwork);
        }
    }, [addresses, activeBlockchain, activeNetwork, loadUTXOs]);

    // Auto-refresh UTXOs on component mount for regtest/cardano
    useEffect(() => {
        // Only auto-refresh if we have addresses and UTXOs are already loaded
        if (addresses.length > 0 && initialized && (config.bitcoin.isRegtest() || isCardano())) {
            refreshUTXOs(activeBlockchain, activeNetwork);
        }
    }, [addresses, initialized, activeBlockchain, activeNetwork, refreshUTXOs, isCardano]);

    // Flatten UTXOs, add isChange flag, filter confirmed UTXOs, and sort by address index
    useEffect(() => {
        const flattened = [];
        const confirmed = [];

        Object.entries(utxos).forEach(([address, addressUtxos]) => {
            const addressEntry = addresses.find(addr => addr.address === address);
            const isChange = addressEntry?.isChange || false;
            const isStaking = addressEntry?.isStaking || false;
            const addressIndex = addressEntry?.index ?? 999999; // Put unknown addresses at the end

            addressUtxos.forEach(utxo => {
                const formattedUtxo = {
                    ...utxo,
                    address,
                    isChange,
                    isStaking,
                    addressIndex,
                    formattedValue: formatValue(utxo.value)
                };

                flattened.push(formattedUtxo);

                if (utxo.status.confirmed) {
                    confirmed.push(formattedUtxo);
                }
            });
        });

        // Sort by address index (ascending), then by isChange (external addresses first), then by txid
        const sortedFlattened = flattened.sort((a, b) => {
            // Primary sort: by address index
            if (a.addressIndex !== b.addressIndex) {
                return a.addressIndex - b.addressIndex;
            }
            // Secondary sort: external addresses (isChange=false) before change addresses (isChange=true)
            if (a.isChange !== b.isChange) {
                return a.isChange ? 1 : -1;
            }
            // Tertiary sort: by transaction ID for consistency
            return a.txid.localeCompare(b.txid);
        });

        const sortedConfirmed = confirmed.sort((a, b) => {
            if (a.addressIndex !== b.addressIndex) {
                return a.addressIndex - b.addressIndex;
            }
            if (a.isChange !== b.isChange) {
                return a.isChange ? 1 : -1;
            }
            return a.txid.localeCompare(b.txid);
        });

        setFlattenedUtxos(sortedFlattened);
        setConfirmedUtxos(sortedConfirmed);
    }, [utxos, addresses, formatValue]);

    const handleRefresh = async () => {
        await refreshUTXOs(activeBlockchain, activeNetwork);
    };

    const handleOpenSendDialog = () => {
        setIsSendDialogOpen(true);
    };

    const handleSendBitcoin = async (sendData) => {
        try {
            if (sendData.utxos && sendData.utxos.length > 0) {
                await utxoManager.processTransactionCompletion(
                    sendData,
                    updateAfterTransaction,
                    activeBlockchain,
                    activeNetwork
                );
            }
        } catch (error) {
            console.error('[UTXOList] Error handling transaction completion:', error);
            refreshUTXOs(activeBlockchain, activeNetwork);
        }
    };


    if (error) {
        return (
            <div>
                <div className="p-6 flex justify-between items-center">
                    <h2 className="text-xl font-bold gradient-text">Your UTXOs</h2>
                    <div className="flex space-x-2">
                        <button
                            className="btn btn-primary"
                            onClick={handleRefresh}
                            disabled={refreshProgress.isRefreshing}
                        >
                            {refreshProgress.isRefreshing ? (
                                <div className="flex items-center space-x-2">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                    <span>
                                        {refreshProgress.processed}/{refreshProgress.total}
                                    </span>
                                </div>
                            ) : (
                                'Refresh'
                            )}
                        </button>
                        {refreshProgress.isRefreshing && (
                            <button
                                className="btn bg-red-600 hover:bg-red-700 text-white"
                                onClick={cancelUTXORefresh}
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                </div>
                <div className="error-message">
                    <p>Error: {error}</p>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="p-6 flex justify-between items-center">
                <h2 className="text-xl font-bold gradient-text">Your UTXOs</h2>
                <div className="flex space-x-2">
                    {isBitcoin() && (
                        <button
                            className={`btn ${confirmedUtxos.length === 0 ? 'opacity-50 cursor-not-allowed bg-dark-700' : 'btn-bitcoin'}`}
                            onClick={handleOpenSendDialog}
                            disabled={confirmedUtxos.length === 0}
                        >
                            Send Bitcoin
                        </button>
                    )}
                    {/* Cardano send button kept commented for now
                    {isCardano() && (
                        <button
                            className={`btn ${confirmedUtxos.length === 0 ? 'opacity-50 cursor-not-allowed bg-dark-700' : 'btn-cardano'}`}
                            onClick={handleOpenSendDialog}
                            disabled={confirmedUtxos.length === 0}
                        >
                            Send ADA
                        </button>
                    )}
                    */}
                    <button
                        className="btn btn-primary"
                        onClick={handleRefresh}
                        disabled={refreshProgress.isRefreshing}
                    >
                        {refreshProgress.isRefreshing ? (
                            <div className="flex items-center space-x-2">
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                <span>
                                    {refreshProgress.processed}/{refreshProgress.total}
                                </span>
                            </div>
                        ) : (
                            'Refresh'
                        )}
                    </button>
                    {refreshProgress.isRefreshing && (
                        <button
                            className="btn bg-red-600 hover:bg-red-700 text-white ml-2"
                            onClick={cancelUTXORefresh}
                        >
                            Cancel
                        </button>
                    )}
                </div>
            </div>

            <div className="mb-4 p-4 card">
                <p className="text-lg">
                    Total Balance:
                    <span className={`font-bold ${isBitcoin() ? 'text-bitcoin-400 bitcoin-glow-text' : 'text-cardano-400 cardano-glow-text'}`}>
                        {formatValue(totalBalance)}
                    </span>
                </p>
            </div>

            <div className="card">
                {isLoading ? (
                    <div className="p-8 text-center">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-400 mb-4"></div>
                        <p className="text-gray-400">Loading UTXOs...</p>
                    </div>
                ) : flattenedUtxos.length === 0 ? (
                    <div className="text-center p-8">
                        <p className="text-dark-300">No UTXOs found. Receive some bitcoin to get started.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead className="bg-dark-700">
                                <tr>
                                    <th className="py-2 px-4 border-b border-dark-600 text-left text-dark-300">UTXO</th>
                                    <th className="py-2 px-4 border-b border-dark-600 text-left text-dark-300">Address</th>
                                    <th className="py-2 px-4 border-b border-dark-600 text-left text-dark-300">Amount & Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {flattenedUtxos.map((utxo, index) => (
                                    <tr key={`${utxo.txid}-${utxo.vout}`} className={index % 2 === 0 ? 'bg-dark-800' : 'bg-dark-750'}>
                                        <td className="py-2 px-4 border-b border-dark-700">
                                            <div className="font-mono text-xs break-all text-dark-200" title={`${utxo.txid}:${utxo.vout}`}>
                                                {utxo.txid}:{utxo.vout}
                                            </div>
                                        </td>
                                        <td className="py-2 px-4 border-b border-dark-700">
                                            <div className="flex flex-col">
                                                <div className="font-mono text-xs break-all text-dark-200" title={utxo.address}>
                                                    {utxo.address}
                                                </div>
                                                {addresses.find(addr => addr.address === utxo.address)?.index !== undefined && (
                                                    <span className="text-xs text-dark-400 mt-1">
                                                        Index: {addresses.find(addr => addr.address === utxo.address)?.index}
                                                        {isBitcoin() && utxo.isChange && (
                                                            <span className="text-primary-400 ml-2">Change Address</span>
                                                        )}
                                                        {isCardano() && utxo.isStaking && (
                                                            <span className="text-cardano-400 ml-2">Staking Address</span>
                                                        )}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-2 px-4 border-b border-dark-700">
                                            <div className="flex flex-col">
                                                <div className={isBitcoin() ? "text-bitcoin-400" : "text-cardano-400"}>
                                                    {utxo.formattedValue}
                                                </div>
                                                <div className="mt-1">
                                                    {utxo.status.confirmed ? (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-900/30 text-green-400">
                                                            Confirmed
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-900/30 text-yellow-400">
                                                            Pending
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Send Bitcoin Dialog - only shown for Bitcoin */}
            {isBitcoin() && (
                <SendBitcoinDialog
                    isOpen={isSendDialogOpen}
                    onClose={() => setIsSendDialogOpen(false)}
                    confirmedUtxos={confirmedUtxos}
                    onSend={handleSendBitcoin}
                    formatValue={formatValue}
                />
            )}
        </div>
    );
}
