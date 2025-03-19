'use client';

import { useState, useEffect } from 'react';
import { deriveXpub, copyToClipboard } from '@/utils/addressUtils';

export default function WalletInfo({ seedPhrase }) {
    const [xpub, setXpub] = useState('');
    const [showXpub, setShowXpub] = useState(false);
    const [copyError, setCopyError] = useState('');
    const [loading, setLoading] = useState(false);

    // Derive xpub on mount/seedPhrase change
    useEffect(() => {
        const getXpub = async () => {
            if (!seedPhrase) return;

            try {
                setLoading(true);
                const derivedXpub = await deriveXpub(seedPhrase);
                setXpub(derivedXpub);
            } catch (error) {
                console.error('Error deriving xpub:', error);
                setCopyError('Failed to derive xpub: ' + error.message);
            } finally {
                setLoading(false);
            }
        };

        getXpub();
    }, [seedPhrase]);

    // Copy xpub
    const handleCopy = async () => {
        const success = await copyToClipboard(xpub);
        if (!success) {
            setCopyError('Failed to copy to clipboard');
        }
    };

    // Toggle xpub visibility
    const toggleXpub = () => {
        setShowXpub(!showXpub);
    };

    if (!seedPhrase) {
        return null;
    }

    return (
        <div className="bg-white rounded-lg shadow-md p-4 mb-4">
            <h3 className="text-lg font-medium mb-3">Wallet Information</h3>

            {copyError && (
                <p className="mb-3 text-sm text-red-600">{copyError}</p>
            )}

            <div className="bg-gray-50 p-3 rounded-md">
                <div className="flex justify-between items-center mb-2">
                    <span className="font-medium">Extended Public Key (xpub)</span>
                    <div className="flex gap-2">
                        <button
                            onClick={toggleXpub}
                            className="px-3 py-1 text-xs text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50"
                            disabled={loading}
                        >
                            {loading ? 'Loading...' : (showXpub ? 'Hide' : 'Show')}
                        </button>
                        {showXpub && (
                            <button
                                onClick={handleCopy}
                                className="px-3 py-1 text-xs text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50"
                                disabled={loading}
                            >
                                Copy
                            </button>
                        )}
                    </div>
                </div>

                {showXpub && xpub && (
                    <div className="bg-gray-100 p-2 rounded">
                        <div className="font-mono text-sm break-all">
                            {xpub}
                        </div>
                        <span className="text-xs text-gray-500 mt-1 block">
                            Path: m/86'/0'/0'
                        </span>
                    </div>
                )}

                <p className="text-xs text-gray-500 mt-2">
                    The extended public key can be used to view your wallet balance and transactions in watch-only mode.
                </p>
            </div>
        </div>
    );
}
