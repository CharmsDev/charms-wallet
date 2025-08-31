'use client';

import { useRouter } from 'next/navigation';

export default function WalletSeed({ hasWallet, seedPhrase, walletInfo }) {
    const router = useRouter();


    const handleShowInstructions = () => {
        router.push('/wallet-setup-instructions');
    };

    const handleShowWalletInfo = () => {
        router.push('/wallet-information');
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
            
            {/* Wallet Information Section */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h4 className="text-sm font-medium text-white">Wallet Information</h4>
                        <p className="text-xs text-dark-400">View seed phrase, public keys, and technical details</p>
                    </div>
                    <div className="text-2xl">🔐</div>
                </div>

                <button
                    onClick={handleShowWalletInfo}
                    className="w-full btn btn-secondary text-sm"
                >
                    View Wallet Information
                </button>

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
                        className="w-full btn btn-secondary text-sm"
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
