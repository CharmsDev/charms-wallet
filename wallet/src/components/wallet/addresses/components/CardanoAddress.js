'use client';

import { useState } from 'react';
import { copyToClipboard } from '@/utils/cardanoAddressUtils';

export default function CardanoAddress({ address, privateKeys, onDelete, isStaking }) {
    const [showPrivateKey, setShowPrivateKey] = useState(false);
    const [copyStatus, setCopyStatus] = useState('');

    // Handle copy address to clipboard
    const handleCopyAddress = async () => {
        const success = await copyToClipboard(address.address);
        if (success) {
            setCopyStatus('Address copied!');
            setTimeout(() => setCopyStatus(''), 2000);
        } else {
            setCopyStatus('Copy failed');
            setTimeout(() => setCopyStatus(''), 2000);
        }
    };

    // Handle copy private key to clipboard
    const handleCopyPrivateKey = async () => {
        if (privateKeys[address.address]) {
            const success = await copyToClipboard(privateKeys[address.address]);
            if (success) {
                setCopyStatus('Private key copied!');
                setTimeout(() => setCopyStatus(''), 2000);
            } else {
                setCopyStatus('Copy failed');
                setTimeout(() => setCopyStatus(''), 2000);
            }
        }
    };

    // Toggle private key visibility
    const togglePrivateKey = () => {
        setShowPrivateKey(!showPrivateKey);
    };

    return (
        <div className="card p-4 bg-dark-800 border border-dark-700 hover:border-cardano-500/30 transition-colors">
            <div className="flex flex-col">
                {/* Address type and index */}
                <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center">
                        <span className="text-cardano-400 font-medium">
                            {isStaking ? 'Staking' : 'Payment'} Address
                        </span>
                        <span className="ml-2 text-dark-400 text-sm">
                            (Index: {address.index})
                        </span>
                    </div>
                    <div className="flex items-center space-x-2">
                        {copyStatus && (
                            <span className="text-xs text-green-400">{copyStatus}</span>
                        )}
                        <button
                            onClick={() => onDelete(address.address)}
                            className="text-red-500 hover:text-red-400 transition-colors"
                            title="Delete address"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Address */}
                <div className="flex items-center mb-2">
                    <div className="font-mono text-xs break-all text-dark-200 flex-grow">
                        {address.address}
                    </div>
                    <button
                        onClick={handleCopyAddress}
                        className="ml-2 text-dark-400 hover:text-cardano-400 transition-colors"
                        title="Copy address"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                    </button>
                </div>

                {/* Private key section */}
                {privateKeys[address.address] && (
                    <div className="mt-2 pt-2 border-t border-dark-700">
                        <div className="flex items-center justify-between">
                            <button
                                onClick={togglePrivateKey}
                                className="text-sm text-dark-400 hover:text-cardano-400 transition-colors flex items-center"
                            >
                                <span>Private Key</span>
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className={`h-4 w-4 ml-1 transition-transform ${showPrivateKey ? 'rotate-180' : ''}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                            {showPrivateKey && (
                                <button
                                    onClick={handleCopyPrivateKey}
                                    className="text-dark-400 hover:text-cardano-400 transition-colors"
                                    title="Copy private key"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                </button>
                            )}
                        </div>
                        {showPrivateKey && (
                            <div className="mt-1 font-mono text-xs break-all text-dark-300">
                                {privateKeys[address.address]}
                            </div>
                        )}
                    </div>
                )}

                {/* Created date */}
                <div className="mt-2 text-xs text-dark-500">
                    Created: {new Date(address.created).toLocaleString()}
                </div>
            </div>
        </div>
    );
}
