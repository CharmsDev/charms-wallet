'use client';

import { useState } from 'react';
import SeedPhraseDisplay from './SeedPhraseDisplay';
import WalletInfoDisplay from './WalletInfoDisplay';
import BitcoinCoreInstructions from './BitcoinCoreInstructions';
import { useWallet } from '@/stores/walletStore';
import { useAddresses } from '@/stores/addressesStore';
import { useUTXOs } from '@/stores/utxoStore';
import { useCharms } from '@/stores/charmsStore';
import { clearAllWalletData } from '@/services/storage';

export default function WalletDashboard({ seedPhrase, walletInfo, createSuccess }) {
    const [copyNotification, setCopyNotification] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const { clearWallet } = useWallet();
    const { clearAddresses } = useAddresses();
    const { utxos, loadUTXOs } = useUTXOs();
    const { charms, loadCharms } = useCharms();

    // Copy text with notification
    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        setCopyNotification(true);
        setTimeout(() => setCopyNotification(false), 2000);
    };

    // Handle wallet deletion
    const handleDeleteWallet = async () => {
        try {
            // Clear all data from localStorage
            await clearAllWalletData();

            // Clear in-memory state in all stores
            await clearWallet();
            await clearAddresses();

            // Reset UTXOs and Charms state
            // Since these stores don't have explicit clear functions,
            // we'll force a reload which will result in empty states
            // since the addresses have been cleared
            await loadUTXOs();
            await loadCharms();

            setShowDeleteDialog(false);
        } catch (error) {
            console.error('Error deleting wallet:', error);
        }
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

                {/* Delete wallet button */}
                <div className="mt-8 flex justify-center">
                    <button
                        onClick={() => setShowDeleteDialog(true)}
                        className="bg-red-500 hover:bg-red-600 text-white font-medium py-2 px-4 rounded-md transition-colors"
                    >
                        Delete Wallet
                    </button>
                </div>
            </div>

            {/* Delete confirmation dialog */}
            {showDeleteDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-md w-full">
                        <h2 className="text-xl font-bold mb-4">Delete Wallet</h2>
                        <p className="mb-6 text-gray-700">
                            Are you sure you want to delete your wallet? This action cannot be undone.
                            Make sure you have saved your seed phrase if you want to recover this wallet in the future.
                        </p>
                        <div className="flex justify-end space-x-4">
                            <button
                                onClick={() => setShowDeleteDialog(false)}
                                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteWallet}
                                className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
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
