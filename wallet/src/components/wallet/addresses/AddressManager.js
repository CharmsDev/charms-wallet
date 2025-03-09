'use client';

import { useState } from 'react';
import { useAddresses } from '@/stores/addressesStore';
import { useWallet } from '@/stores/walletStore';
import { validateAddress, generateTaprootAddress, importPrivateKey, copyToClipboard } from '@/utils/addressUtils';

export default function AddressManager() {
    const { addresses, addAddress, deleteAddress } = useAddresses();
    const { seedPhrase } = useWallet();

    const [newAddress, setNewAddress] = useState('');
    const [privateKey, setPrivateKey] = useState('');
    const [addressError, setAddressError] = useState('');
    const [showConfirmDelete, setShowConfirmDelete] = useState(false);
    const [addressToDelete, setAddressToDelete] = useState(null);
    const [importMode, setImportMode] = useState('address'); // 'address' or 'privateKey'

    // Set address for deletion
    const handleDeleteClick = (address) => {
        setAddressToDelete(address);
        setShowConfirmDelete(true);
    };

    // Delete selected address(es)
    const confirmDelete = () => {
        if (addressToDelete) {
            const addressEntry = addresses.find(addr => addr.address === addressToDelete);
            if (addressEntry && addressEntry.index >= 0) {
                // Delete both addresses with the same index
                const addressesToDelete = addresses.filter(addr =>
                    addr.index === addressEntry.index
                );
                addressesToDelete.forEach(addr => {
                    deleteAddress(addr.address);
                });
            } else {
                // Delete single custom address
                deleteAddress(addressToDelete);
            }
            setAddressToDelete(null);
            setShowConfirmDelete(false);
        }
    };

    // Cancel deletion
    const cancelDelete = () => {
        setAddressToDelete(null);
        setShowConfirmDelete(false);
    };

    // Generate new address pair (external + change)
    const generateNewAddress = async () => {
        try {
            setAddressError('');
            if (!seedPhrase) {
                setAddressError('No wallet found');
                return;
            }

            // Calculate next indices
            const externalAddresses = addresses.filter(addr => addr.index >= 0 && !addr.isChange);
            const nextExternalIndex = externalAddresses.length;
            const changeAddresses = addresses.filter(addr => addr.index >= 0 && addr.isChange);
            const nextChangeIndex = changeAddresses.length;

            // Generate addresses
            const newExternalAddress = await generateTaprootAddress(seedPhrase, nextExternalIndex, false);
            const newChangeAddress = await generateTaprootAddress(seedPhrase, nextChangeIndex, true);

            // Store addresses
            await addAddress({
                address: newExternalAddress,
                index: nextExternalIndex,
                isChange: false,
                created: new Date().toISOString()
            });
            await addAddress({
                address: newChangeAddress,
                index: nextChangeIndex,
                isChange: true,
                created: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error generating addresses:', error);
            setAddressError('Failed to generate addresses: ' + error.message);
        }
    };

    // Copy address to clipboard
    const handleCopy = async (text) => {
        const success = await copyToClipboard(text);
        if (!success) {
            setAddressError('Failed to copy to clipboard');
        }
    };

    return (
        <div className="mt-8 space-y-6">

            {/* Main address container */}
            <div className="bg-white rounded-lg shadow-md p-4">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium">Your Addresses</h3>
                    <button
                        onClick={generateNewAddress}
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-md"
                    >
                        Generate New Address
                    </button>
                </div>
                {addressError && (
                    <p className="mb-3 text-sm text-red-600">{addressError}</p>
                )}
                <div className="space-y-4 max-h-[500px] overflow-y-auto">
                    {addresses.length === 0 ? (
                        <p className="text-gray-500">No addresses yet. Generate or import an address to get started.</p>
                    ) : (
                        (() => {
                            // Group and organize addresses
                            const addressPairs = {};
                            const customAddresses = [];

                            addresses.forEach(addr => {
                                if (addr.index === -1) {
                                    customAddresses.push(addr);
                                } else {
                                    if (!addressPairs[addr.index]) {
                                        addressPairs[addr.index] = [];
                                    }
                                    addressPairs[addr.index].push(addr);
                                }
                            });

                            return (
                                <>
                                    {Object.entries(addressPairs).map(([index, addrGroup]) => {
                                        const externalAddr = addrGroup.find(a => !a.isChange);
                                        const changeAddr = addrGroup.find(a => a.isChange);

                                        return (
                                            <div key={`pair-${index}`} className="bg-gray-50 p-4 rounded-md">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="font-medium text-sm">Address Pair - Index: {index}</span>
                                                    <button
                                                        onClick={() => handleDeleteClick(externalAddr?.address || changeAddr?.address)}
                                                        className="px-3 py-1 text-xs text-white bg-red-600 hover:bg-red-700 rounded-md"
                                                    >
                                                        Delete Pair
                                                    </button>
                                                </div>

                                                {/* Receiving address */}
                                                {externalAddr && (
                                                    <div className="flex items-center justify-between mb-2 pl-2 border-l-4 border-blue-500">
                                                        <div className="flex-1">
                                                            <div className="font-mono text-sm truncate">
                                                                {externalAddr.address}
                                                            </div>
                                                            <span className="text-xs text-gray-500">Receiving Address</span>
                                                        </div>
                                                        <button
                                                            onClick={() => handleCopy(externalAddr.address)}
                                                            className="px-3 py-1 text-xs text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50"
                                                        >
                                                            Copy
                                                        </button>
                                                    </div>
                                                )}

                                                {/* Change address */}
                                                {changeAddr && (
                                                    <div className="flex items-center justify-between pl-2 border-l-4 border-green-500">
                                                        <div className="flex-1">
                                                            <div className="font-mono text-sm truncate">
                                                                {changeAddr.address}
                                                            </div>
                                                            <span className="text-xs text-gray-500">Change Address</span>
                                                        </div>
                                                        <button
                                                            onClick={() => handleCopy(changeAddr.address)}
                                                            className="px-3 py-1 text-xs text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50"
                                                        >
                                                            Copy
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {/* Custom imported addresses */}
                                    {customAddresses.map(addr => (
                                        <div key={addr.address} className="flex items-center justify-between bg-gray-50 p-3 rounded-md">
                                            <div className="flex-1 font-mono text-sm truncate">
                                                {addr.address}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-500">Custom</span>
                                                <button
                                                    onClick={() => handleCopy(addr.address)}
                                                    className="px-3 py-1 text-xs text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50"
                                                >
                                                    Copy
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteClick(addr.address)}
                                                    className="px-3 py-1 text-xs text-white bg-red-600 hover:bg-red-700 rounded-md"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </>
                            );
                        })()
                    )}
                </div>
            </div>

            {/* Delete confirmation dialog */}
            {showConfirmDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-md w-full">
                        <h3 className="text-lg font-medium mb-4">Delete Address</h3>
                        {(() => {
                            const addressEntry = addresses.find(addr => addr.address === addressToDelete);
                            if (addressEntry && addressEntry.index >= 0) {
                                return (
                                    <p className="mb-6">
                                        Are you sure you want to delete this address pair (index: {addressEntry.index})?
                                        Both the receiving and change addresses will be deleted.
                                    </p>
                                );
                            } else {
                                return <p className="mb-6">Are you sure you want to delete this address?</p>;
                            }
                        })()}
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={cancelDelete}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium border border-gray-300 rounded-md"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-md"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
