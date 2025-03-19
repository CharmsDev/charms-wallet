'use client';

import { useState, useEffect } from 'react';
import { useUTXOs } from '@/stores/utxoStore';
import { useAddresses } from '@/stores/addressesStore';

export default function UTXOList() {
    const { utxos, isLoading, error, totalBalance, refreshUTXOs, formatSats } = useUTXOs();
    const { addresses } = useAddresses();
    const [flattenedUtxos, setFlattenedUtxos] = useState([]);

    // Flatten UTXOs, add isChange flag
    useEffect(() => {
        const flattened = [];
        Object.entries(utxos).forEach(([address, addressUtxos]) => {
            const addressEntry = addresses.find(addr => addr.address === address);
            const isChange = addressEntry?.isChange || false;

            addressUtxos.forEach(utxo => {
                flattened.push({
                    ...utxo,
                    address,
                    isChange
                });
            });
        });
        setFlattenedUtxos(flattened);
    }, [utxos, addresses]);

    const handleRefresh = async () => {
        await refreshUTXOs();
    };

    if (isLoading) {
        return (
            <div className="p-4">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold">UTXOs</h2>
                    <button
                        className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                        disabled={true}
                    >
                        Refreshing...
                    </button>
                </div>
                <div className="flex justify-center items-center h-40">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold">UTXOs</h2>
                    <button
                        className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                        onClick={handleRefresh}
                    >
                        Refresh
                    </button>
                </div>
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                    <p>Error: {error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">UTXOs</h2>
                <button
                    className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                    onClick={handleRefresh}
                >
                    Refresh
                </button>
            </div>

            <div className="mb-4 p-3 bg-gray-100 rounded">
                <p className="text-lg">
                    Total Balance: <span className="font-semibold">{formatSats(totalBalance)} BTC</span>
                </p>
            </div>

            {flattenedUtxos.length === 0 ? (
                <div className="text-center p-8 bg-gray-50 rounded">
                    <p className="text-gray-500">No UTXOs found. Receive some bitcoin to get started.</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full bg-white border border-gray-200">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="py-2 px-4 border-b text-left">UTXO</th>
                                <th className="py-2 px-4 border-b text-left">Address</th>
                                <th className="py-2 px-4 border-b text-left">Amount & Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {flattenedUtxos.map((utxo, index) => (
                                <tr key={`${utxo.txid}-${utxo.vout}`} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                                    <td className="py-2 px-4 border-b">
                                        <div className="font-mono text-xs break-all" title={`${utxo.txid}:${utxo.vout}`}>
                                            {utxo.txid}:{utxo.vout}
                                        </div>
                                    </td>
                                    <td className="py-2 px-4 border-b">
                                        <div className="flex flex-col">
                                            <div className="font-mono text-xs break-all" title={utxo.address}>
                                                {utxo.address}
                                            </div>
                                            {addresses.find(addr => addr.address === utxo.address)?.index !== undefined && (
                                                <span className="text-xs text-gray-600 mt-1">
                                                    Index: {addresses.find(addr => addr.address === utxo.address)?.index}
                                                    {utxo.isChange && (
                                                        <span className="text-blue-600 ml-2">Change Address</span>
                                                    )}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-2 px-4 border-b">
                                        <div className="flex flex-col">
                                            <div>{formatSats(utxo.value)} BTC</div>
                                            <div className="mt-1">
                                                {utxo.status.confirmed ? (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                        Confirmed
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
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
    );
}
