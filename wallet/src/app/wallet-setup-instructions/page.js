'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/stores/walletStore';
import { useBlockchain } from '@/stores/blockchainStore';
import { deriveXpubFromSeedPhrase } from '@/utils/descriptorUtils';

export default function WalletSetupInstructions() {
    const router = useRouter();
    const { seedPhrase, hasWallet } = useWallet();
    const { activeNetwork } = useBlockchain();
    const [walletInfo, setWalletInfo] = useState({
        fingerprint: '',
        path: "86'/1'/0'",
        xpriv: '',
        walletHash: '',
        derivationLoading: true
    });
    const [checksum1, setChecksum1] = useState('');
    const [checksum2, setChecksum2] = useState('');

    // Generate wallet hash from seed phrase for unique wallet names
    const generateWalletHash = (seedPhrase) => {
        if (!seedPhrase) return '';
        // Create a simple hash from the seed phrase for wallet naming
        let hash = 0;
        for (let i = 0; i < seedPhrase.length; i++) {
            const char = seedPhrase.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(16).substring(0, 4);
    };

    useEffect(() => {
        if (hasWallet && seedPhrase) {
            const deriveWalletInfo = async () => {
                try {
                    const path = activeNetwork === 'mainnet' ? "m/86'/0'/0'" : "m/86'/1'/0'";
                    const derived = await deriveXpubFromSeedPhrase(seedPhrase, path);
                    const walletHash = generateWalletHash(seedPhrase);
                    
                    setWalletInfo({
                        fingerprint: derived.masterFingerprint,
                        path: derived.path.replace('m/', ''), // Remove m/ prefix for descriptor format
                        xpriv: derived.xpriv,
                        walletHash: walletHash,
                        derivationLoading: false
                    });
                } catch (error) {
                    console.error('Error deriving wallet info:', error);
                    setWalletInfo(prev => ({ ...prev, derivationLoading: false }));
                }
            };
            
            deriveWalletInfo();
        }
    }, [hasWallet, seedPhrase, activeNetwork]);

    const copyToClipboard = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const networkName = activeNetwork === 'mainnet' ? 'mainnet' : 'testnet4';
    const isTestnet = activeNetwork !== 'mainnet';

    return (
        <div className="min-h-screen bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900 p-6">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold gradient-text mb-2">
                            Bitcoin Core Setup Instructions
                        </h1>
                        <p className="text-dark-400">
                            Import your Charms wallet to Bitcoin Core ({networkName})
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

                {/* Main Instructions */}
                {hasWallet && (
                    <div className="space-y-6">
                        {/* Overview */}
                        <div className="card p-6">
                            <h2 className="text-xl font-semibold gradient-text mb-4">Overview</h2>
                            <div className="glass-effect border-l-4 border-blue-400 p-4 mb-4">
                                <p className="text-sm text-blue-300">
                                    <strong>Descriptor Wallets:</strong> We're using Bitcoin Core's modern descriptor wallet format, 
                                    which provides better security and flexibility by explicitly defining script types and derivation paths.
                                </p>
                            </div>
                            <p className="text-dark-300 mb-4">
                                This guide will help you import your Charms wallet into Bitcoin Core running on {networkName}. 
                                This allows you to use Bitcoin Core as a full node while maintaining the same wallet addresses.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="glass-effect p-4 rounded-lg text-center">
                                    <div className="text-2xl mb-2">🔗</div>
                                    <h3 className="text-sm font-semibold text-white">Step 1</h3>
                                    <p className="text-xs text-dark-400">Check existing wallets</p>
                                </div>
                                <div className="glass-effect p-4 rounded-lg text-center">
                                    <div className="text-2xl mb-2">🆕</div>
                                    <h3 className="text-sm font-semibold text-white">Step 2</h3>
                                    <p className="text-xs text-dark-400">Create descriptor wallet</p>
                                </div>
                                <div className="glass-effect p-4 rounded-lg text-center">
                                    <div className="text-2xl mb-2">📥</div>
                                    <h3 className="text-sm font-semibold text-white">Step 3</h3>
                                    <p className="text-xs text-dark-400">Import descriptors</p>
                                </div>
                            </div>
                        </div>

                        {/* Step 1: Check Existing Wallets */}
                        <div className="card p-6">
                            <h2 className="text-xl font-semibold gradient-text mb-4">Step 1: Check Existing Wallets</h2>
                            <p className="text-dark-300 mb-3">First, check if you already have wallets loaded:</p>
                            <div className="bg-dark-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto whitespace-pre-wrap mb-3 relative">
                                {`bitcoin-cli ${isTestnet ? '-testnet4 ' : ''}listwallets`}
                                <button
                                    onClick={() => copyToClipboard(`bitcoin-cli ${isTestnet ? '-testnet4 ' : ''}listwallets`)}
                                    className="absolute top-2 right-2 bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white px-2 py-1 rounded text-xs"
                                >
                                    📋 Copy
                                </button>
                            </div>
                            <p className="text-dark-300 mb-3">If "charms-wallet-{walletInfo.walletHash}" already exists, unload it:</p>
                            <div className="bg-dark-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto whitespace-pre-wrap mb-3 relative">
                                {`bitcoin-cli ${isTestnet ? '-testnet4 ' : ''}unloadwallet "charms-wallet-${walletInfo.walletHash}"`}
                                <button
                                    onClick={() => copyToClipboard(`bitcoin-cli ${isTestnet ? '-testnet4 ' : ''}unloadwallet "charms-wallet-${walletInfo.walletHash}"`)}
                                    className="absolute top-2 right-2 bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white px-2 py-1 rounded text-xs"
                                >
                                    📋 Copy
                                </button>
                            </div>
                        </div>

                        {/* Step 2: Create Descriptor Wallet */}
                        <div className="card p-6">
                            <h2 className="text-xl font-semibold gradient-text mb-4">Step 2: Create Descriptor Wallet</h2>
                            <p className="text-dark-300 mb-3">Create a new descriptor wallet:</p>
                            <div className="bg-dark-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto whitespace-pre-wrap mb-3 relative">
                                {`bitcoin-cli ${isTestnet ? '-testnet4 ' : ''}createwallet "charms-wallet-${walletInfo.walletHash}" false false "" false true true`}
                                <button
                                    onClick={() => copyToClipboard(`bitcoin-cli ${isTestnet ? '-testnet4 ' : ''}createwallet "charms-wallet-${walletInfo.walletHash}" false false "" false true true`)}
                                    className="absolute top-2 right-2 bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white px-2 py-1 rounded text-xs"
                                >
                                    📋 Copy
                                </button>
                            </div>
                            <div className="glass-effect border-l-4 border-yellow-400 p-4">
                                <p className="text-sm text-yellow-300">
                                    <strong>Parameters explained:</strong> This creates a descriptor wallet with private keys 
                                    that allows both tracking and signing transactions directly with Bitcoin Core.
                                </p>
                            </div>
                        </div>

                        {/* Step 3: Get Descriptor Checksums */}
                        <div className="card p-6">
                            <h2 className="text-xl font-semibold gradient-text mb-4">Step 3: Get Descriptor Checksums</h2>
                            <p className="text-dark-300 mb-3">Get checksums for receiving addresses (external):</p>
                            <div className="bg-dark-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto whitespace-pre-wrap mb-3 relative">
                                {walletInfo.derivationLoading ? (
                                    "Generating command..."
                                ) : (
                                    `bitcoin-cli ${isTestnet ? '-testnet4 ' : ''}getdescriptorinfo "tr([${walletInfo.fingerprint}/${walletInfo.path}]${walletInfo.xpriv}/0/*)"`
                                )}
                                <button
                                    onClick={() => copyToClipboard(`bitcoin-cli ${isTestnet ? '-testnet4 ' : ''}getdescriptorinfo "tr([${walletInfo.fingerprint}/${walletInfo.path}]${walletInfo.xpriv}/0/*)"`)}
                                    className="absolute top-2 right-2 bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white px-2 py-1 rounded text-xs"
                                    disabled={walletInfo.derivationLoading}
                                >
                                    📋 Copy
                                </button>
                            </div>
                            <input
                                type="text"
                                value={checksum1}
                                onChange={(e) => setChecksum1(e.target.value)}
                                placeholder="Enter checksum for receiving addresses"
                                className="w-full p-3 bg-dark-700 border border-dark-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4"
                            />

                            <p className="text-dark-300 mb-3">Get checksums for change addresses (internal):</p>
                            <div className="bg-dark-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto whitespace-pre-wrap mb-3 relative">
                                {walletInfo.derivationLoading ? (
                                    "Generating command..."
                                ) : (
                                    `bitcoin-cli ${isTestnet ? '-testnet4 ' : ''}getdescriptorinfo "tr([${walletInfo.fingerprint}/${walletInfo.path}]${walletInfo.xpriv}/1/*)"`
                                )}
                                <button
                                    onClick={() => copyToClipboard(`bitcoin-cli ${isTestnet ? '-testnet4 ' : ''}getdescriptorinfo "tr([${walletInfo.fingerprint}/${walletInfo.path}]${walletInfo.xpriv}/1/*)"`)}
                                    className="absolute top-2 right-2 bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white px-2 py-1 rounded text-xs"
                                    disabled={walletInfo.derivationLoading}
                                >
                                    📋 Copy
                                </button>
                            </div>
                            <input
                                type="text"
                                value={checksum2}
                                onChange={(e) => setChecksum2(e.target.value)}
                                placeholder="Enter checksum for change addresses"
                                className="w-full p-3 bg-dark-700 border border-dark-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4"
                            />
                            <p className="text-xs text-dark-400">
                                These commands will return descriptors with checksums in the "descriptor" field. 
                                Copy the checksum portion (after the #) into the fields above.
                            </p>
                        </div>

                        {/* Step 4: Import Descriptors */}
                        <div className="card p-6">
                            <h2 className="text-xl font-semibold gradient-text mb-4">Step 4: Import Wallet Descriptors</h2>
                            <p className="text-dark-300 mb-3">Import the wallet descriptors with checksums:</p>
                            <div className="bg-dark-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto whitespace-pre-wrap relative">
                                <p className="text-yellow-300 mb-3">
                                    # Replace CHECKSUM1 and CHECKSUM2 with the actual checksums from above
                                </p>
                                {walletInfo.derivationLoading ? (
                                    "Generating command..."
                                ) : (
                                    `bitcoin-cli ${isTestnet ? '-testnet4 ' : ''}importdescriptors '[
  {
    "desc": "tr([${walletInfo.fingerprint}/${walletInfo.path}]${walletInfo.xpriv}/0/*)#${checksum1 || "CHECKSUM1"}",
    "active": true,
    "timestamp": "now",
    "internal": false,
    "range": [0, 1000]
  },
  {
    "desc": "tr([${walletInfo.fingerprint}/${walletInfo.path}]${walletInfo.xpriv}/1/*)#${checksum2 || "CHECKSUM2"}",
    "active": true,
    "timestamp": "now",
    "internal": true,
    "range": [0, 1000]
  }
]'`
                                )}
                                <button
                                    onClick={() => copyToClipboard(`bitcoin-cli ${isTestnet ? '-testnet4 ' : ''}importdescriptors '[
  {
    "desc": "tr([${walletInfo.fingerprint}/${walletInfo.path}]${walletInfo.xpriv}/0/*)#${checksum1 || "CHECKSUM1"}",
    "active": true,
    "timestamp": "now",
    "internal": false,
    "range": [0, 1000]
  },
  {
    "desc": "tr([${walletInfo.fingerprint}/${walletInfo.path}]${walletInfo.xpriv}/1/*)#${checksum2 || "CHECKSUM2"}",
    "active": true,
    "timestamp": "now",
    "internal": true,
    "range": [0, 1000]
  }
]'`)}
                                    className="absolute top-2 right-2 bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white px-2 py-1 rounded text-xs"
                                    disabled={walletInfo.derivationLoading}
                                >
                                    📋 Copy
                                </button>
                            </div>
                        </div>

                        {/* Verification */}
                        <div className="card p-6">
                            <h2 className="text-xl font-semibold gradient-text mb-4">Verification</h2>
                            <p className="text-dark-300 mb-3">Verify the wallet was imported successfully:</p>
                            <div className="bg-dark-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto whitespace-pre-wrap mb-3 relative">
                                {`bitcoin-cli ${isTestnet ? '-testnet4 ' : ''}getwalletinfo`}
                                <button
                                    onClick={() => copyToClipboard(`bitcoin-cli ${isTestnet ? '-testnet4 ' : ''}getwalletinfo`)}
                                    className="absolute top-2 right-2 bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white px-2 py-1 rounded text-xs"
                                >
                                    📋 Copy
                                </button>
                            </div>
                            <p className="text-dark-300 mb-3">Check your wallet balance:</p>
                            <div className="bg-dark-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto whitespace-pre-wrap mb-3 relative">
                                {`bitcoin-cli ${isTestnet ? '-testnet4 ' : ''}getbalance`}
                                <button
                                    onClick={() => copyToClipboard(`bitcoin-cli ${isTestnet ? '-testnet4 ' : ''}getbalance`)}
                                    className="absolute top-2 right-2 bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white px-2 py-1 rounded text-xs"
                                >
                                    📋 Copy
                                </button>
                            </div>
                        </div>

                        {/* Important Notes */}
                        <div className="card p-6">
                            <h2 className="text-xl font-semibold gradient-text mb-4">Important Notes</h2>
                            <div className="space-y-4">
                                <div className="glass-effect border-l-4 border-blue-400 p-4">
                                    <h3 className="text-sm font-semibold text-blue-300 mb-2">🔐 Security</h3>
                                    <p className="text-xs text-dark-300">
                                        This setup uses your actual private keys, allowing Bitcoin Core to sign transactions. 
                                        Ensure your Bitcoin Core installation is secure and encrypted.
                                    </p>
                                </div>
                                <div className="glass-effect border-l-4 border-green-400 p-4">
                                    <h3 className="text-sm font-semibold text-green-300 mb-2">⚡ Performance</h3>
                                    <p className="text-xs text-dark-300">
                                        Setting timestamp to "now" starts blockchain scanning from the current time, 
                                        reducing initial sync duration.
                                    </p>
                                </div>
                                <div className="glass-effect border-l-4 border-yellow-400 p-4">
                                    <h3 className="text-sm font-semibold text-yellow-300 mb-2">🔄 Synchronization</h3>
                                    <p className="text-xs text-dark-300">
                                        Your Bitcoin Core node needs to be fully synced to see all transactions. 
                                        The wallet will show transactions as they are discovered during sync.
                                    </p>
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
            </div>
        </div>
    );
}
