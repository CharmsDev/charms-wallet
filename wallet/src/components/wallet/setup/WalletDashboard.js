'use client';

import { useState, useEffect } from 'react';
import SeedPhraseDisplay from './SeedPhraseDisplay';
import WalletInfoDisplay from './WalletInfoDisplay';
import BitcoinCoreInstructions from './BitcoinCoreInstructions';
import { useWallet } from '@/stores/walletStore';
import { useAddresses } from '@/stores/addressesStore';
import { useUTXOs } from '@/stores/utxoStore';
import { useCharms } from '@/stores/charmsStore';
import { clearAllWalletData } from '@/services/storage';

export default function WalletDashboard({ seedPhrase, walletInfo, derivationLoading, createSuccess }) {
    const [copyNotification, setCopyNotification] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const { clearWallet } = useWallet();
    const {
        isGenerating: isGeneratingAddresses,
        generationProgress,
        clearAddresses
    } = useAddresses();
    const { utxos, loadUTXOs, clearUTXOs } = useUTXOs();
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
            clearUTXOs();

            // Reset Charms state by loading with empty UTXOs
            await loadCharms();

            setShowDeleteDialog(false);
        } catch (error) {
            console.error('Error deleting wallet:', error);
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
                {derivationLoading || isGeneratingAddresses ? (
                    <div className="flex flex-col justify-center items-center p-8 space-y-4">
                        <div className="text-center">
                            <p className="text-lg mb-2">
                                {derivationLoading ? 'Deriving wallet information...' : 'Generating initial addresses...'}
                            </p>
                            {isGeneratingAddresses && generationProgress.total > 0 && (
                                <div className="w-full max-w-md mx-auto">
                                    <div className="flex justify-between text-sm text-dark-400 mb-1">
                                        <span>Progress</span>
                                        <span>{generationProgress.current}/{generationProgress.total}</span>
                                    </div>
                                    <div className="w-full bg-dark-700 rounded-full h-2">
                                        <div
                                            className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                                            style={{
                                                width: `${(generationProgress.current / generationProgress.total) * 100}%`
                                            }}
                                        ></div>
                                    </div>
                                    <p className="text-xs text-dark-500 mt-1">
                                        Generating address pairs for your wallet...
                                    </p>
                                </div>
                            )}
                        </div>
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
                    </div>
                ) : (
                    <>
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
                    </>
                )}

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
