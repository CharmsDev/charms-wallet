'use client';

import { useState, useEffect } from 'react';
import { useAddresses } from '@/stores/addressesStore';
import { useBlockchain } from '@/stores/blockchainStore';

export default function ReceiveBitcoinDialog({ isOpen, onClose, assetName = 'Bitcoin' }) {
    const [currentAddressIndex, setCurrentAddressIndex] = useState(0);
    const [displayAddress, setDisplayAddress] = useState('');
    
    const { addresses, loadAddresses } = useAddresses();
    const { activeBlockchain, activeNetwork } = useBlockchain();

    // Load addresses when dialog opens
    useEffect(() => {
        if (isOpen && addresses.length === 0) {
            loadAddresses(activeBlockchain, activeNetwork);
        }
    }, [isOpen, addresses.length, loadAddresses, activeBlockchain, activeNetwork]);

    // Set display address when addresses are loaded or index changes
    useEffect(() => {
        if (addresses.length > 0) {
            const address = addresses[currentAddressIndex];
            setDisplayAddress(address?.address || '');
        }
    }, [addresses, currentAddressIndex]);

    // Reset index when dialog closes
    useEffect(() => {
        if (!isOpen) {
            setCurrentAddressIndex(0);
        }
    }, [isOpen]);

    const handleSwitchAddress = () => {
        if (currentAddressIndex < addresses.length - 1) {
            setCurrentAddressIndex(prev => prev + 1);
        } else {
            // Loop back to first address
            setCurrentAddressIndex(0);
        }
    };

    const handleCopyAddress = async () => {
        if (displayAddress) {
            try {
                await navigator.clipboard.writeText(displayAddress);
                // Could add a toast notification here
            } catch (err) {
                console.error('Failed to copy address:', err);
            }
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
            <div className="bg-dark-900 rounded-lg p-6 w-full max-w-2xl mx-4 border border-white/20">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold gradient-text">Receive {assetName}</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="space-y-4">
                    <div className="glass-effect p-4 rounded-lg">
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            {assetName} Address ({activeNetwork})
                        </label>
                        <div className="bg-dark-800 p-3 rounded border break-all text-sm font-mono">
                            {displayAddress || 'Loading address...'}
                        </div>
                    </div>

                    <p className="text-gray-300 text-sm text-center">
                        Send {assetName} to this address and you will see it in your balance when UTXOs refresh.
                    </p>

                    <div className="flex space-x-3">
                        <button
                            onClick={handleCopyAddress}
                            disabled={!displayAddress}
                            className="flex-1 btn-primary"
                        >
                            Copy Address
                        </button>
                        <button
                            onClick={handleSwitchAddress}
                            disabled={addresses.length === 0}
                            className="flex-1 bg-dark-700 hover:bg-dark-600 text-white py-2 px-4 rounded transition-colors disabled:opacity-50"
                        >
                            Switch Address
                        </button>
                    </div>

                    {addresses.length > 0 && (
                        <p className="text-xs text-gray-400 text-center">
                            Address {currentAddressIndex + 1} of {addresses.length}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
