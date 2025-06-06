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
            // Error deleting wallet
        }
    };

    return (
        <div>
            <div className="p-6 flex justify-between items-center">
                <h2 className="text-xl font-bold gradient-text">Your Wallet</h2>
                <button
                    onClick={() => setShowDeleteDialog(true)}
                    className="btn bg-red-600 hover:bg-red-700 text-white"
                >
                    Delete Wallet
                </button>
            </div>

            <div className="card p-6 mb-6 space-y-6">
                {/* Wallet Information Box */}
                <div className="glass-effect p-6 rounded-xl">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Left column: Seed Phrase */}
                        <SeedPhraseDisplay seedPhrase={seedPhrase} onCopy={copyToClipboard} />

                        {/* Right column: Wallet Information */}
                        <WalletInfoDisplay walletInfo={walletInfo} onCopy={copyToClipboard} />
                    </div>
                </div>

                {/* Bitcoin Core Instructions Box */}
                <div className="glass-effect p-6 rounded-xl mt-6">
                    <h3 className="text-xl font-bold gradient-text mb-4">Bitcoin Core Integration</h3>
                    <BitcoinCoreInstructions walletInfo={walletInfo} onCopy={copyToClipboard} />
                </div>

                {/* Copy notification */}
                {copyNotification && (
                    <div className="fixed top-4 right-4 bg-green-900/70 border border-green-700 text-green-400 px-4 py-2 rounded-lg shadow-md z-50">
                        Copied to clipboard!
                    </div>
                )}

                {createSuccess && (
                    <div className="glass-effect border-l-4 border-green-500 p-4">
                        <p className="text-green-400">
                            Wallet setup successful! Make sure to save your seed phrase.
                        </p>
                    </div>
                )}
            </div>

            {/* Delete confirmation dialog */}
            {showDeleteDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="card p-6 max-w-md w-full">
                        <h2 className="text-xl font-bold gradient-text mb-4">Delete Wallet</h2>
                        <p className="mb-6 text-dark-200">
                            Are you sure you want to delete your wallet? This action cannot be undone.
                            Make sure you have saved your seed phrase if you want to recover this wallet in the future.
                        </p>
                        <div className="flex justify-end space-x-4">
                            <button
                                onClick={() => setShowDeleteDialog(false)}
                                className="btn btn-secondary"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteWallet}
                                className="btn bg-red-600 hover:bg-red-700 text-white"
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
