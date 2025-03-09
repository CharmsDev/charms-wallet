'use client';

import { useState } from 'react';
import SeedPhraseDisplay from './SeedPhraseDisplay';
import WalletInfoDisplay from './WalletInfoDisplay';
import BitcoinCoreInstructions from './BitcoinCoreInstructions';

export default function WalletDashboard({ seedPhrase, walletInfo, createSuccess }) {
    const [copyNotification, setCopyNotification] = useState(false);

    // Function to copy text to clipboard and show notification
    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        setCopyNotification(true);
        setTimeout(() => setCopyNotification(false), 2000);
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
            <div className="w-full max-w-4xl bg-white rounded-lg shadow-md p-8 space-y-8">
                <h1 className="text-2xl font-bold text-center text-gray-900 mb-6">
                    Your Wallet
                </h1>

                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
                    <p className="text-yellow-800">
                        <strong>Important:</strong> Keep your seed phrase safe. It's the only way to recover your wallet.
                    </p>
                </div>

                <div className="bg-gray-100 p-4 rounded-md">
                    <div className="grid grid-cols-2 gap-6">
                        {/* Left column: Seed Phrase */}
                        <SeedPhraseDisplay seedPhrase={seedPhrase} onCopy={copyToClipboard} />

                        {/* Right column: Wallet Information */}
                        <WalletInfoDisplay walletInfo={walletInfo} onCopy={copyToClipboard} />
                    </div>

                    {/* Bitcoin Core Instructions */}
                    <BitcoinCoreInstructions walletInfo={walletInfo} onCopy={copyToClipboard} />
                </div>

                {/* Copy notification */}
                {copyNotification && (
                    <div className="fixed top-4 right-4 bg-green-100 border border-green-400 text-green-700 px-4 py-2 rounded shadow-md z-50">
                        Copied to clipboard!
                    </div>
                )}

                {createSuccess && (
                    <div className="bg-green-50 border-l-4 border-green-400 p-4">
                        <p className="text-green-800">
                            Wallet created successfully! Make sure to save your seed phrase.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
