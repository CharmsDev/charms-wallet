'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function WalletSeed({ hasWallet, seedPhrase }) {
    const [showSeedPhrase, setShowSeedPhrase] = useState(false);
    const router = useRouter();

    const copyToClipboard = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const handleShowInstructions = () => {
        router.push('/wallet-setup-instructions');
    };

    if (!hasWallet || !seedPhrase) {
        return (
            <div className="card p-6">
                <h3 className="text-lg font-semibold gradient-text mb-4">Wallet Keys</h3>
                <div className="text-center py-8">
                    <div className="text-4xl mb-4">🔑</div>
                    <p className="text-dark-400">No wallet found</p>
                    <p className="text-xs text-dark-500 mt-2">Create or import a wallet to manage your keys</p>
                </div>
            </div>
        );
    }

    return (
        <div className="card p-6">
            <h3 className="text-lg font-semibold gradient-text mb-4">Wallet Keys</h3>
            
            {/* Seed Phrase Section */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h4 className="text-sm font-medium text-white">Seed Phrase</h4>
                        <p className="text-xs text-dark-400">Your wallet recovery phrase</p>
                    </div>
                    <div className="text-2xl">🔐</div>
                </div>

                <button
                    onClick={() => setShowSeedPhrase(!showSeedPhrase)}
                    className="w-full btn btn-secondary text-sm"
                >
                    {showSeedPhrase ? 'Hide' : 'Show'} Seed Phrase
                </button>

                {showSeedPhrase && (
                    <div className="glass-effect p-4 rounded-lg border-l-4 border-yellow-500">
                        <div className="flex items-start space-x-2 mb-3">
                            <span className="text-yellow-400">⚠️</span>
                            <p className="text-xs text-yellow-400 font-medium">
                                Keep your seed phrase secure and private
                            </p>
                        </div>
                        <div className="bg-dark-900 p-3 rounded font-mono text-xs break-all mb-3">
                            {seedPhrase}
                        </div>
                        <button
                            onClick={() => copyToClipboard(seedPhrase)}
                            className="w-full btn btn-primary text-xs py-2"
                        >
                            📋 Copy Seed Phrase
                        </button>
                    </div>
                )}

                {/* Bitcoin Core Integration */}
                <div className="mt-6 pt-4 border-t border-dark-700">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h4 className="text-sm font-medium text-dark-300">Bitcoin Core Integration</h4>
                            <p className="text-xs text-dark-400">Import this wallet to your local Bitcoin node</p>
                        </div>
                        <div className="text-lg">⚡</div>
                    </div>
                    
                    <p className="text-xs text-dark-400 mb-3">
                        Connect this wallet to your Bitcoin Core testnet4 node for enhanced privacy and control.
                    </p>
                    
                    <button
                        onClick={handleShowInstructions}
                        className="w-full btn btn-outline text-sm"
                    >
                        📖 View Setup Instructions
                    </button>
                </div>

                {/* Security Tips */}
                <div className="mt-4 pt-4 border-t border-dark-700">
                    <h4 className="text-sm font-medium text-dark-300 mb-3">Security Tips</h4>
                    <div className="space-y-2 text-xs text-dark-400">
                        <div className="flex items-center space-x-2">
                            <span className="text-blue-400">💾</span>
                            <span>Write down your seed phrase on paper</span>
                        </div>
                        <div className="flex items-center space-x-2">
                            <span className="text-blue-400">🏠</span>
                            <span>Store backup in a secure location</span>
                        </div>
                        <div className="flex items-center space-x-2">
                            <span className="text-blue-400">🚫</span>
                            <span>Never share your seed phrase online</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
