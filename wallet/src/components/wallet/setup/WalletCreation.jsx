'use client';

import { useState } from 'react';

export default function WalletCreation({ isLoading, onCreateWallet, onImportWallet, onTransferFromWeb }) {
    const [inputSeedPhrase, setInputSeedPhrase] = useState('');
    const [importError, setImportError] = useState('');

    const handleImportWallet = async () => {
        setImportError('');

        if (!inputSeedPhrase.trim()) {
            setImportError('Please enter a seed phrase');
            return;
        }

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

    const handleTransfer = () => {
        // Generate a simple transfer token and open the web wallet with it
        const token = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        window.open(`https://wallet.charms.dev/?transfer=${token}`, '_blank');
        if (onTransferFromWeb) onTransferFromWeb();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex flex-col items-center justify-center px-4 z-50">
            <div className="w-full max-w-md card p-8 space-y-8">
                <h1 className="text-2xl font-bold text-center gradient-text mb-6">
                    Bitcoin Wallet
                </h1>
                {/* Create wallet button */}
                <div className="flex justify-center">
                    <button
                        onClick={onCreateWallet}
                        disabled={isLoading}
                        className="btn btn-primary w-full py-3"
                    >
                        {isLoading ? 'Creating...' : 'Create New Wallet'}
                    </button>
                </div>

                <div className="relative flex items-center">
                    <div className="flex-grow border-t border-dark-600"></div>
                    <span className="flex-shrink mx-4 text-gray-400">or</span>
                    <div className="flex-grow border-t border-dark-600"></div>
                </div>

                {/* Import wallet section */}
                <div className="space-y-4">
                    <div>
                        <label htmlFor="seedPhrase" className="block text-sm font-medium text-gray-300 mb-1">
                            Enter Seed Phrase
                        </label>
                        <textarea
                            id="seedPhrase"
                            rows="3"
                            className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            placeholder="Enter your 12 or 24 word seed phrase separated by spaces"
                            value={inputSeedPhrase}
                            onChange={(e) => setInputSeedPhrase(e.target.value)}
                        ></textarea>
                    </div>
                    {importError && (
                        <div className="text-red-400 text-sm mt-1">
                            {importError}
                        </div>
                    )}
                    <button
                        onClick={handleImportWallet}
                        disabled={isLoading}
                        className="btn btn-secondary w-full py-3"
                    >
                        {isLoading ? 'Importing...' : 'Import Wallet'}
                    </button>
                </div>

                {/* Transfer from Web Wallet — only shown in extension context */}
                {onTransferFromWeb && (
                    <>
                        <div className="relative flex items-center">
                            <div className="flex-grow border-t border-dark-600"></div>
                            <span className="flex-shrink mx-4 text-gray-400">or</span>
                            <div className="flex-grow border-t border-dark-600"></div>
                        </div>

                        <button
                            onClick={handleTransfer}
                            disabled={isLoading}
                            className="w-full py-3 px-4 rounded-lg border border-bitcoin-500/40 bg-bitcoin-500/10 hover:bg-bitcoin-500/20 text-bitcoin-400 font-medium transition-colors flex items-center justify-center gap-2"
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                                <line x1="8" y1="21" x2="16" y2="21" />
                                <line x1="12" y1="17" x2="12" y2="21" />
                            </svg>
                            Transfer from Charms Web Wallet
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
