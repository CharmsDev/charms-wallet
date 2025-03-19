'use client';

import { useState } from 'react';
import { copyToClipboard } from '@/utils/addressUtils';

export default function AddressCard({
    address,
    label,
    borderColor = 'border-blue-500',
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
                    <div className="font-mono text-sm truncate">
                        {address}
                    </div>
                    <span className="text-xs text-gray-500">{label}</span>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => handleCopy(address)}
                        className="px-3 py-1 text-xs text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                        Copy
                    </button>
                    {showDeleteButton && (
                        <button
                            onClick={onDelete}
                            className="px-3 py-1 text-xs text-white bg-red-600 hover:bg-red-700 rounded-md"
                        >
                            Delete
                        </button>
                    )}
                </div>
            </div>

            {privateKey && (
                <div className="mt-1 bg-gray-100 p-2 rounded">
                    <div className="flex items-center justify-between">
                        <div className="font-mono text-sm truncate text-red-600">
                            {privateKey}
                        </div>
                        <button
                            onClick={() => handleCopy(privateKey)}
                            className="px-3 py-1 text-xs text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50"
                        >
                            Copy
                        </button>
                    </div>
                    <span className="text-xs text-red-500">Private Key</span>
                </div>
            )}
        </div>
    );
}
