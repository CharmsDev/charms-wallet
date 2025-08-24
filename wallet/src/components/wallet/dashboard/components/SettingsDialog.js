'use client';

import { useState } from 'react';
import { useWallet } from '@/stores/walletStore';
import { clearAllWalletData } from '@/services/storage';

export default function SettingsDialog({ isOpen, onClose }) {
    const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    
    const handleDeleteWallet = async () => {
        setIsDeleting(true);
        try {
            // Clear all wallet data from localStorage
            await clearAllWalletData();
            onClose();
            // Reload the page to redirect to wallet creation
            window.location.reload();
        } catch (error) {
            console.error('Failed to delete wallet:', error);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleCancelDelete = () => {
        setShowDeleteConfirmation(false);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
            <div className="bg-dark-900 rounded-lg p-6 w-full max-w-lg mx-4 border border-white/20">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold gradient-text">Settings</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="space-y-6">
                    {!showDeleteConfirmation ? (
                        <>
                            <div className="glass-effect p-4 rounded-lg">
                                <h3 className="text-lg font-medium text-red-400 mb-2">Danger Zone</h3>
                                <p className="text-gray-300 text-sm mb-4">
                                    Permanently delete your wallet and all associated data. This action cannot be undone.
                                </p>
                                <p className="text-yellow-400 text-sm mb-4">
                                    ⚠️ Make sure you have backed up your seed phrase before proceeding.
                                </p>
                                <button
                                    onClick={() => setShowDeleteConfirmation(true)}
                                    className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded transition-colors"
                                >
                                    Delete Wallet
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="glass-effect p-4 rounded-lg">
                            <h3 className="text-lg font-medium text-red-400 mb-4">Confirm Wallet Deletion</h3>
                            <p className="text-gray-300 text-sm mb-4">
                                Are you absolutely sure you want to delete your wallet? This will permanently remove:
                            </p>
                            <ul className="text-gray-300 text-sm mb-6 space-y-1 ml-4">
                                <li>• Your seed phrase and private keys</li>
                                <li>• All wallet addresses</li>
                                <li>• Transaction history</li>
                                <li>• UTXO data</li>
                                <li>• All settings and preferences</li>
                            </ul>
                            <p className="text-red-400 text-sm font-medium mb-6">
                                This action is irreversible. You will lose access to your Bitcoin unless you have your seed phrase backed up elsewhere.
                            </p>
                            
                            <div className="flex space-x-3">
                                <button
                                    onClick={handleCancelDelete}
                                    disabled={isDeleting}
                                    className="flex-1 bg-dark-700 hover:bg-dark-600 text-white py-2 px-4 rounded transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDeleteWallet}
                                    disabled={isDeleting}
                                    className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded transition-colors disabled:opacity-50"
                                >
                                    {isDeleting ? 'Deleting...' : 'Yes, Delete Wallet'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
