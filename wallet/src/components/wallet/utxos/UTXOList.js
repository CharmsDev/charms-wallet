'use client';

import { useState, useEffect } from 'react';
import { useUTXOs } from '@/stores/utxoStore';
import { useAddresses } from '@/stores/addressesStore';
import { useBlockchain } from '@/stores/blockchainStore';
import config from '@/config';
import SendBitcoinDialog from './SendBitcoinDialog';

export default function UTXOList() {
    const { utxos, isLoading, error, totalBalance, refreshUTXOs, formatValue } = useUTXOs();
    const { addresses } = useAddresses();
    const { isBitcoin, isCardano } = useBlockchain();
    const [flattenedUtxos, setFlattenedUtxos] = useState([]);
    const [isSendDialogOpen, setIsSendDialogOpen] = useState(false);
    const [confirmedUtxos, setConfirmedUtxos] = useState([]);

    // Refresh UTXOs on component mount
    useEffect(() => {
        // If we're in regtest mode or using Cardano, refresh UTXOs on mount
        if (config.bitcoin.isRegtest() || isCardano()) {
            refreshUTXOs();
        }
    }, []);

    // Flatten UTXOs, add isChange flag, and filter confirmed UTXOs
    useEffect(() => {
        const flattened = [];
        const confirmed = [];

        Object.entries(utxos).forEach(([address, addressUtxos]) => {
            const addressEntry = addresses.find(addr => addr.address === address);
            const isChange = addressEntry?.isChange || false;
            const isStaking = addressEntry?.isStaking || false;

            addressUtxos.forEach(utxo => {
                const formattedUtxo = {
                    ...utxo,
                    address,
                    isChange,
                    isStaking,
                    formattedValue: formatValue(utxo.value)
                };

                flattened.push(formattedUtxo);

                if (utxo.status.confirmed) {
                    confirmed.push(formattedUtxo);
                }
            });
        });

        setFlattenedUtxos(flattened);
        setConfirmedUtxos(confirmed);
    }, [utxos, addresses, formatValue]);

    const handleRefresh = async () => {
        await refreshUTXOs();
    };

    const handleOpenSendDialog = () => {
        setIsSendDialogOpen(true);
    };

    const handleSendBitcoin = (sendData) => {
        // Show loading state
        setIsSendDialogOpen(false);


        // Transaction has been sent successfully
        // Just refresh UTXOs to show updated balances
        refreshUTXOs();
    };

    if (isLoading) {
        return (
            <div>
                <div className="p-6 flex justify-between items-center">
                    <h2 className="text-xl font-bold gradient-text">UTXOs</h2>
                    <button
                        className="btn btn-primary opacity-50 cursor-not-allowed"
                        disabled={true}
                    >
                        Refreshing...
                    </button>
                </div>
                <div className="flex justify-center items-center h-40">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div>
                <div className="p-6 flex justify-between items-center">
                    <h2 className="text-xl font-bold gradient-text">UTXOs</h2>
                    <button
                        className="btn btn-primary"
                        onClick={handleRefresh}
                    >
                        Refresh
                    </button>
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
                <h2 className="text-xl font-bold gradient-text">UTXOs</h2>
                <div className="flex space-x-2">
                    {/* Send buttons commented out for mobile view
                    {isBitcoin() && (
                        <button
                            className={`btn ${confirmedUtxos.length === 0 ? 'opacity-50 cursor-not-allowed bg-dark-700' : 'btn-bitcoin'}`}
                            onClick={handleOpenSendDialog}
                            disabled={confirmedUtxos.length === 0}
                        >
                            Send Bitcoin
                        </button>
                    )}
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
                    >
                        Refresh
                    </button>
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

            {flattenedUtxos.length === 0 ? (
                <div className="text-center p-8 glass-effect rounded-xl">
                    <p className="text-dark-300">No UTXOs found. Receive some bitcoin to get started.</p>
                </div>
            ) : (
                <div className="overflow-x-auto card">
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
