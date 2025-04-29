'use client';

import { useState } from 'react';
import { copyToClipboard } from '@/utils/addressUtils';

export default function AddressCard({
    address,
    label,
    borderColor = 'border-primary-500',
    privateKey,
    onDelete,
    showDeleteButton = false
}) {
    const [copyError, setCopyError] = useState('');

    // Copy address
    const handleCopy = async (text) => {
        const success = await copyToClipboard(text);
        if (!success) {
            setCopyError('Failed to copy to clipboard');
        }
    };

    return (
        <div className={`pl-2 border-l-4 ${borderColor}`}>
            {copyError && <p className="text-xs text-red-600 mb-1">{copyError}</p>}

            <div className="flex items-center justify-between">
                <div className="flex-1">
                    <div className="font-mono text-sm truncate text-white">
                        {address}
                    </div>
                    <span className="text-xs text-dark-300">{label}</span>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => handleCopy(address)}
                        className="px-3 py-1 text-xs text-dark-300 hover:text-white border border-dark-600 rounded-full hover:bg-dark-700"
                    >
                        Copy
                    </button>
                    {showDeleteButton && (
                        <button
                            onClick={onDelete}
                            className="px-3 py-1 text-xs text-white bg-red-600 hover:bg-red-700 rounded-full"
                        >
                            Delete
                        </button>
                    )}
                </div>
            </div>

            {privateKey && (
                <div className="mt-1 bg-dark-800 p-2 rounded-lg border border-dark-700">
                    <div className="flex items-center justify-between">
                        <div className="font-mono text-sm truncate text-red-400">
                            {privateKey}
                        </div>
                        <button
                            onClick={() => handleCopy(privateKey)}
                            className="px-3 py-1 text-xs text-dark-300 hover:text-white border border-dark-600 rounded-full hover:bg-dark-700"
                        >
                            Copy
                        </button>
                    </div>
                    <span className="text-xs text-red-400">Private Key</span>
                </div>
            )}
        </div>
    );
}
