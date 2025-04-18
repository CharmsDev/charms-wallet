'use client';

import { useState } from 'react';

export default function WalletCreation({ isLoading, onCreateWallet, onImportWallet }) {
    const [inputSeedPhrase, setInputSeedPhrase] = useState('');
    const [importError, setImportError] = useState('');

    const handleImportWallet = async () => {
        // Reset error state
        setImportError('');

        // Validate input
        if (!inputSeedPhrase.trim()) {
            setImportError('Please enter a seed phrase');
            return;
        }

        // Check if it's likely a valid seed phrase (basic check)
        const words = inputSeedPhrase.trim().split(/\s+/);
        if (words.length !== 12 && words.length !== 24) {
            setImportError('Seed phrase must be 12 or 24 words');
            return;
        }

        try {
            await onImportWallet(inputSeedPhrase);
        } catch (err) {
            setImportError(err.message || 'Failed to import wallet');
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
            <div className="w-full max-w-md bg-white rounded-lg shadow-md p-8 space-y-8">
                <h1 className="text-2xl font-bold text-center text-gray-900 mb-6">
                    Bitcoin Wallet
                </h1>

                {/* Create wallet button */}
                <div className="flex justify-center">
                    <button
                        onClick={onCreateWallet}
                        disabled={isLoading}
                        className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-3 px-4 rounded-md transition-colors"
                    >
                        {isLoading ? 'Creating...' : 'Create New Wallet'}
                    </button>
                </div>

                <div className="relative flex items-center">
                    <div className="flex-grow border-t border-gray-300"></div>
                    <span className="flex-shrink mx-4 text-gray-600">or</span>
                    <div className="flex-grow border-t border-gray-300"></div>
                </div>

                {/* Import wallet section */}
                <div className="space-y-4">
                    <div>
                        <label htmlFor="seedPhrase" className="block text-sm font-medium text-gray-700 mb-1">
                            Enter Seed Phrase
                        </label>
                        <textarea
                            id="seedPhrase"
                            rows="3"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Enter your 12 or 24 word seed phrase separated by spaces"
                            value={inputSeedPhrase}
                            onChange={(e) => setInputSeedPhrase(e.target.value)}
                        ></textarea>
                    </div>
                    {importError && (
                        <div className="text-red-500 text-sm mt-1">
                            {importError}
                        </div>
                    )}
                    <button
                        onClick={handleImportWallet}
                        disabled={isLoading}
                        className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-3 px-4 rounded-md transition-colors"
                    >
                        {isLoading ? 'Importing...' : 'Import Wallet'}
                    </button>
                </div>
            </div>
        </div>
    );
}
