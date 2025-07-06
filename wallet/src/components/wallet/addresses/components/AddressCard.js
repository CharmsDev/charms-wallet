'use client';

import { useState } from 'react';
import { copyToClipboard } from '@/utils/addressUtils';

const CopyIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);

export default function AddressCard({
    address,
    label,
    privateKey,
    onDelete,
    showDeleteButton = false
}) {
    const [copied, setCopied] = useState('');

    const handleCopy = (text, type) => {
        copyToClipboard(text);
        setCopied(type);
        setTimeout(() => setCopied(''), 2000);
    };

    return (
        <div className="bg-gray-900 p-2 rounded-md">
            <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-400">{label}</span>
                {showDeleteButton && (
                    <button
                        onClick={onDelete}
                        className="px-2 py-0.5 text-xs text-white bg-red-600 hover:bg-red-700 rounded-full"
                    >
                        Delete
                    </button>
                )}
            </div>

            <div className="flex items-center justify-between">
                <p className="font-mono text-sm break-all text-white flex-1">{address}</p>
                <button onClick={() => handleCopy(address, 'address')} className="ml-2 text-gray-400 hover:text-white">
                    {copied === 'address' ? <span className="text-xs">Copied!</span> : <CopyIcon />}
                </button>
            </div>

            {privateKey && (
                <div className="mt-2 pt-2 border-t border-gray-700">
                    <div className="flex items-center justify-between">
                        <p className="font-mono text-sm break-all text-red-400 flex-1">{privateKey}</p>
                        <button onClick={() => handleCopy(privateKey, 'pk')} className="ml-2 text-gray-400 hover:text-white">
                            {copied === 'pk' ? <span className="text-xs">Copied!</span> : <CopyIcon />}
                        </button>
                    </div>
                    <span className="text-xs text-red-500">Private Key</span>
                </div>
            )}
        </div>
    );
}
