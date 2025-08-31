'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/stores/walletStore';
import { useWalletInfo } from '@/stores/walletInfoStore';
import { useBlockchain } from '@/stores/blockchainStore';

export default function WalletInformation() {
    const router = useRouter();
    const { seedPhrase, hasWallet } = useWallet();
    const { walletInfo, derivationLoading, loadWalletInfo } = useWalletInfo();
    const { activeBlockchain, activeNetwork } = useBlockchain();
    const [copyNotification, setCopyNotification] = useState(false);
    const [showSeedPhrase, setShowSeedPhrase] = useState(false);

    // Load wallet info when component mounts
    useEffect(() => {
        if (hasWallet && seedPhrase && !derivationLoading) {
            loadWalletInfo(seedPhrase, activeBlockchain, activeNetwork);
        }
    }, [hasWallet, seedPhrase, derivationLoading, loadWalletInfo, activeBlockchain, activeNetwork]);

    const copyToClipboard = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopyNotification(true);
            setTimeout(() => setCopyNotification(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const networkName = activeNetwork === 'mainnet' ? 'mainnet' : 'testnet4';

    return (
        <div className="min-h-screen bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900 p-6">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold gradient-text mb-2">
                            Wallet Information
                        </h1>
                        <p className="text-dark-400">
                            View your wallet's seed phrase, public keys, and technical details ({networkName})
                        </p>
                    </div>
                    <button
                        onClick={() => router.back()}
                        className="btn btn-secondary"
                    >
                        ← Back to Dashboard
                    </button>
                </div>

                {/* Warning for no wallet */}
                {!hasWallet && (
                    <div className="card p-6 mb-6 border-l-4 border-red-500">
                        <div className="flex items-center space-x-3">
                            <span className="text-2xl">⚠️</span>
                            <div>
                                <h3 className="text-lg font-semibold text-red-400">No Wallet Found</h3>
                                <p className="text-dark-400">You need to create or import a wallet first.</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Main Content */}
                {hasWallet && (
                    <div className="space-y-6">
                        {/* Overview */}
                        <div className="card p-6">
                            <h2 className="text-xl font-semibold gradient-text mb-4">Overview</h2>
                            <div className="glass-effect border-l-4 border-blue-400 p-4 mb-4">
                                <p className="text-sm text-blue-300">
                                    <strong>Security Notice:</strong> This page contains sensitive information about your wallet. 
                                    Keep this information secure and never share it online or with untrusted parties.
                                </p>
                            </div>
                            <p className="text-dark-300 mb-4">
                                Here you can view all technical information about your Bitcoin wallet, including your recovery seed phrase, 
                                public keys, and derivation paths. This information can be used to restore your wallet or integrate it with other Bitcoin software.
                            </p>
                        </div>

                        {/* Seed Phrase Section */}
                        <div className="card p-6">
                            <h2 className="text-xl font-semibold gradient-text mb-4">Seed Phrase</h2>
                            <p className="text-dark-300 mb-4">Your 12-word recovery phrase that can restore your entire wallet:</p>
                            
                            <button
                                onClick={() => setShowSeedPhrase(!showSeedPhrase)}
                                className="w-full btn btn-secondary mb-4"
                            >
                                {showSeedPhrase ? 'Hide' : 'Show'} Seed Phrase
                            </button>

                            {showSeedPhrase && (
                                <div className="glass-effect border-l-4 border-yellow-500 p-6">
                                    <div className="flex items-start space-x-2 mb-4">
                                        <span className="text-yellow-400 text-xl">⚠️</span>
                                        <div>
                                            <p className="text-sm text-yellow-400 font-medium mb-2">
                                                Critical Security Warning
                                            </p>
                                            <ul className="text-xs text-yellow-300 space-y-1">
                                                <li>• Anyone with this seed phrase can access your Bitcoin</li>
                                                <li>• Write it down on paper and store it securely offline</li>
                                                <li>• Never share it online, via email, or with anyone</li>
                                                <li>• Keep multiple secure backups in different locations</li>
                                            </ul>
                                        </div>
                                    </div>
                                    <div className="bg-dark-900 p-4 rounded-lg font-mono text-sm break-all mb-4 text-white border border-dark-700">
                                        {seedPhrase}
                                    </div>
                                    <button
                                        onClick={() => copyToClipboard(seedPhrase)}
                                        className="w-full btn btn-primary"
                                    >
                                        📋 Copy Seed Phrase
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Technical Information */}
                        <div className="card p-6">
                            <h2 className="text-xl font-semibold gradient-text mb-4">Technical Information</h2>
                            
                            {derivationLoading ? (
                                <div className="flex justify-center items-center h-40">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
                                    <p className="ml-2 text-dark-300">Deriving wallet information...</p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {/* Master Key Fingerprint */}
                                    <div>
                                        <h3 className="font-medium text-primary-400 mb-2">Master Key Fingerprint:</h3>
                                        <p className="text-xs text-dark-400 mb-3">
                                            Unique identifier for your master key, used in derivation paths and wallet descriptors.
                                        </p>
                                        <div className="relative">
                                            <div className="bg-dark-900 p-4 rounded-lg border border-dark-700 font-mono text-sm break-all text-white">
                                                {walletInfo?.fingerprint || 'Not available'}
                                            </div>
                                            {walletInfo?.fingerprint && (
                                                <button
                                                    onClick={() => copyToClipboard(walletInfo.fingerprint)}
                                                    className="absolute top-2 right-2 bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white px-3 py-1 rounded text-xs"
                                                >
                                                    📋 Copy
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Derivation Path */}
                                    <div>
                                        <h3 className="font-medium text-primary-400 mb-2">Derivation Path (Taproot):</h3>
                                        <p className="text-xs text-dark-400 mb-3">
                                            BIP86 derivation path for Taproot (P2TR) addresses. The standard path for modern Bitcoin wallets.
                                        </p>
                                        <div className="relative">
                                            <div className="bg-dark-900 p-4 rounded-lg border border-dark-700 font-mono text-sm text-white">
                                                m/{walletInfo?.path || "86'/0'/0'"}
                                            </div>
                                            <button
                                                onClick={() => copyToClipboard(`m/${walletInfo?.path || "86'/0'/0'"}`)}
                                                className="absolute top-2 right-2 bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white px-3 py-1 rounded text-xs"
                                            >
                                                📋 Copy
                                            </button>
                                        </div>
                                    </div>

                                    {/* Extended Public Key */}
                                    <div>
                                        <h3 className="font-medium text-primary-400 mb-2">Extended Public Key (xpub):</h3>
                                        <p className="text-xs text-dark-400 mb-3">
                                            Public key that can generate all your receiving addresses. Safe to share for watch-only wallets.
                                        </p>
                                        <div className="relative">
                                            <div className="bg-dark-900 p-4 rounded-lg border border-dark-700 font-mono text-sm break-all text-white">
                                                {walletInfo?.xpub || 'Not available'}
                                            </div>
                                            {walletInfo?.xpub && (
                                                <button
                                                    onClick={() => copyToClipboard(walletInfo.xpub)}
                                                    className="absolute top-2 right-2 bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white px-3 py-1 rounded text-xs"
                                                >
                                                    📋 Copy
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Extended Private Key */}
                                    <div>
                                        <h3 className="font-medium text-primary-400 mb-2">Extended Private Key (xpriv):</h3>
                                        <p className="text-xs text-dark-400 mb-3">
                                            Private key that can generate and spend from all addresses. Keep this absolutely secret.
                                        </p>
                                        <div className="relative">
                                            <div className="bg-dark-900 p-4 rounded-lg border border-dark-700 font-mono text-sm break-all text-white">
                                                {walletInfo?.xpriv ? '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••' : 'Not available'}
                                            </div>
                                            {walletInfo?.xpriv && (
                                                <button
                                                    onClick={() => copyToClipboard(walletInfo.xpriv)}
                                                    className="absolute top-2 right-2 bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white px-3 py-1 rounded text-xs"
                                                >
                                                    📋 Copy
                                                </button>
                                            )}
                                        </div>
                                        <div className="glass-effect border-l-4 border-red-500 p-4 mt-3">
                                            <p className="text-xs text-red-400">
                                                <strong>⚠️ Critical Warning:</strong> Never share your extended private key with anyone. 
                                                Anyone with this key can steal all your Bitcoin. Only use this for wallet recovery or advanced integrations.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Security Guidelines */}
                        <div className="card p-6">
                            <h2 className="text-xl font-semibold gradient-text mb-4">Security Guidelines</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="glass-effect border-l-4 border-green-400 p-4">
                                    <h3 className="text-sm font-semibold text-green-300 mb-3">✅ Best Practices</h3>
                                    <div className="space-y-2 text-xs text-dark-300">
                                        <div className="flex items-center space-x-2">
                                            <span className="text-green-400">💾</span>
                                            <span>Write seed phrase on paper, not digital</span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <span className="text-green-400">🏠</span>
                                            <span>Store backups in multiple secure locations</span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <span className="text-green-400">🔐</span>
                                            <span>Use hardware wallets for large amounts</span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <span className="text-green-400">🔍</span>
                                            <span>Verify addresses before sending Bitcoin</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="glass-effect border-l-4 border-red-400 p-4">
                                    <h3 className="text-sm font-semibold text-red-300 mb-3">❌ Never Do</h3>
                                    <div className="space-y-2 text-xs text-dark-300">
                                        <div className="flex items-center space-x-2">
                                            <span className="text-red-400">🚫</span>
                                            <span>Share seed phrase online or via email</span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <span className="text-red-400">📱</span>
                                            <span>Store seed phrase in photos or cloud</span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <span className="text-red-400">💻</span>
                                            <span>Type seed phrase on untrusted computers</span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <span className="text-red-400">🗣️</span>
                                            <span>Tell anyone your seed phrase or private keys</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                )}

                {/* Footer */}
                <div className="text-center mt-8 pt-6 border-t border-dark-700">
                    <button
                        onClick={() => router.back()}
                        className="btn btn-primary"
                    >
                        ← Return to Dashboard
                    </button>
                </div>

                {/* Copy notification */}
                {copyNotification && (
                    <div className="fixed top-4 right-4 bg-green-900/70 border border-green-700 text-green-400 px-4 py-2 rounded-lg shadow-md z-50">
                        Copied to clipboard!
                    </div>
                )}
            </div>
        </div>
    );
}
