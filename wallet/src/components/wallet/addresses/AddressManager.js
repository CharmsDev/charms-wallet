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

    // Handle address deletion
    const handleDeleteClick = (address) => {
        setAddressToDelete(address);
        setShowConfirmDelete(true);
    };

    // Confirm address deletion
    const confirmDelete = () => {
        if (addressToDelete) {
            deleteAddress(addressToDelete);
            setAddressToDelete(null);
            setShowConfirmDelete(false);
        }
    };

    // Cancel address deletion
    const cancelDelete = () => {
        setAddressToDelete(null);
        setShowConfirmDelete(false);
    };

    // Generate a new address
    const generateNewAddress = async () => {
        try {
            setAddressError('');

            if (!seedPhrase) {
                setAddressError('No wallet found');
                return;
            }

            // Generate a new address using the seed phrase
            const nextIndex = addresses.filter(addr => addr.index >= 0).length;
            const newAddress = await generateTaprootAddress(seedPhrase, nextIndex);

            // Add the address
            addAddress({
                address: newAddress,
                index: nextIndex,
                created: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error generating address:', error);
            setAddressError('Failed to generate address: ' + error.message);
        }
    };

    // Handle copy to clipboard
    const handleCopy = async (text) => {
        const success = await copyToClipboard(text);
        if (!success) {
            setAddressError('Failed to copy to clipboard');
        }
    };

    return (
        <div className="mt-8 space-y-6">

            {/* Address List */}
            <div className="bg-white rounded-lg shadow-md p-4">
                <h3 className="text-lg font-medium mb-3">Your Addresses</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                    {addresses.length === 0 ? (
                        <p className="text-gray-500">No addresses yet. Generate or import an address to get started.</p>
                    ) : (
                        addresses.map((addr) => (
                            <div key={addr.address} className="flex items-center justify-between bg-gray-50 p-3 rounded-md">
                                <div className="flex-1 font-mono text-sm truncate">
                                    {addr.address}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500">
                                        {addr.index === -1 ? "Custom" : `Index: ${addr.index}`}
                                    </span>
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
                        ))
                    )}
                </div>
            </div>

            {/* Generate Address Button */}
            <div className="flex justify-center mt-4">
                <button
                    onClick={generateNewAddress}
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-md"
                >
                    Generate New Address
                </button>
            </div>
            {addressError && (
                <p className="mt-2 text-sm text-red-600 text-center">{addressError}</p>
            )}

            {/* Confirmation Dialog */}
            {showConfirmDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-md w-full">
                        <h3 className="text-lg font-medium mb-4">Delete Address</h3>
                        <p className="mb-6">Are you sure you want to delete this address?</p>
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
