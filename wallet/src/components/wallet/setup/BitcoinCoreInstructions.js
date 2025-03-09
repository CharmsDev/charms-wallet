'use client';
import { useState } from 'react';

export default function BitcoinCoreInstructions({ walletInfo, onCopy }) {
    const [checksum1, setChecksum1] = useState('');
    const [checksum2, setChecksum2] = useState('');
    return (
        <div className="mt-4 border-t border-gray-300 pt-4">
            <h3 className="text-md font-semibold mb-2">Import to Bitcoin Core (testnet4):</h3>

            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-4">
                <p className="text-sm text-yellow-800">
                    <strong>Note:</strong> We're using descriptor wallets, which is the modern approach recommended by Bitcoin Core.
                    Descriptor wallets provide more flexibility and better security by explicitly defining the script types and derivation paths.
                </p>
            </div>

            <p className="text-sm mb-2">First, check if you already have wallets:</p>
            <div className="bg-gray-800 text-green-400 p-3 rounded font-mono text-sm overflow-x-auto whitespace-pre-wrap mb-3 relative">
                {`bitcoin-cli listwallets`}
                <button
                    onClick={() => onCopy(`bitcoin-cli listwallets`)}
                    className="absolute top-2 right-2 bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded text-xs"
                >
                    Copy
                </button>
            </div>

            <p className="text-sm mb-2">If "charms-wallet-1" already exists, unload it:</p>
            <div className="bg-gray-800 text-green-400 p-3 rounded font-mono text-sm overflow-x-auto whitespace-pre-wrap mb-3 relative">
                {`bitcoin-cli unloadwallet "LISTED_WALLET_NAME"`}
                <button
                    onClick={() => onCopy(`bitcoin-cli unloadwallet "LISTED_WALLET_NAME"`)}
                    className="absolute top-2 right-2 bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded text-xs"
                >
                    Copy
                </button>
            </div>

            <p className="text-sm mb-2">Create a new descriptor wallet:</p>
            <div className="bg-gray-800 text-green-400 p-3 rounded font-mono text-sm overflow-x-auto whitespace-pre-wrap mb-3 relative">
                {`bitcoin-cli createwallet "charms-wallet-1" false false "" false true true`}
                <button
                    onClick={() => onCopy(`bitcoin-cli createwallet "charms-wallet-1" false false "" false true true`)}
                    className="absolute top-2 right-2 bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded text-xs"
                >
                    Copy
                </button>
            </div>

            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-4">
                <p className="text-sm text-yellow-800">
                    <strong>Note:</strong> We're now using taproot descriptors with private keys to create a fully functional wallet.
                    This allows you to both track your wallet balance and sign transactions directly with Bitcoin Core.
                </p>
            </div>

            <p className="text-sm mb-2">Get the descriptor checksums:</p>
            <div className="bg-gray-800 text-green-400 p-3 rounded font-mono text-sm overflow-x-auto whitespace-pre-wrap mb-1 relative">
                {walletInfo.derivationLoading ? (
                    "Generating command..."
                ) : (
                    `bitcoin-cli getdescriptorinfo "tr([${walletInfo.fingerprint}/${walletInfo.path}]${walletInfo.xpriv}/0/*)"`
                )}
                <button
                    onClick={() => onCopy(`bitcoin-cli getdescriptorinfo "tr([${walletInfo.fingerprint}/${walletInfo.path}]${walletInfo.xpriv}/0/*)"`)}
                    className="absolute top-2 right-2 bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded text-xs"
                >
                    Copy
                </button>
            </div>
            <div className="mb-3">
                <input
                    type="text"
                    value={checksum1}
                    onChange={(e) => setChecksum1(e.target.value)}
                    placeholder="Enter checksum for receiving addresses"
                    className="w-full p-2 border border-gray-300 rounded text-sm"
                />
            </div>
            <div className="bg-gray-800 text-green-400 p-3 rounded font-mono text-sm overflow-x-auto whitespace-pre-wrap mb-1 relative">
                {walletInfo.derivationLoading ? (
                    "Generating command..."
                ) : (
                    `bitcoin-cli getdescriptorinfo "tr([${walletInfo.fingerprint}/${walletInfo.path}]${walletInfo.xpriv}/1/*)"`
                )}
                <button
                    onClick={() => onCopy(`bitcoin-cli getdescriptorinfo "tr([${walletInfo.fingerprint}/${walletInfo.path}]${walletInfo.xpriv}/1/*)"`)}
                    className="absolute top-2 right-2 bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded text-xs"
                >
                    Copy
                </button>
            </div>
            <div className="mb-3">
                <input
                    type="text"
                    value={checksum2}
                    onChange={(e) => setChecksum2(e.target.value)}
                    placeholder="Enter checksum for change addresses"
                    className="w-full p-2 border border-gray-300 rounded text-sm"
                />
            </div>
            <p className="text-sm text-gray-600 mb-4">
                These commands use your actual master key fingerprint and extended public key.
                The commands will return the descriptors with checksums in the "descriptor" field.
            </p>

            <p className="text-sm mb-2">Import the wallet descriptors with checksums:</p>
            <div className="bg-gray-800 text-green-400 p-3 rounded font-mono text-sm overflow-x-auto whitespace-pre-wrap relative">
                <p className="text-yellow-300 mb-2">
                    # After running the getdescriptorinfo commands above, replace CHECKSUM1 and CHECKSUM2 with the actual checksums
                </p>
                {walletInfo.derivationLoading ? (
                    "Generating command..."
                ) : (
                    `bitcoin-cli importdescriptors '[
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
                    onClick={() => onCopy(`bitcoin-cli importdescriptors '[
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
                    className="absolute top-2 right-2 bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded text-xs"
                >
                    Copy
                </button>
            </div>

            <p className="text-xs text-gray-600 mt-3">
                This approach uses descriptor wallets to define exactly which addresses belong to your wallet.
                The command above uses your actual fingerprint, derivation path, and xpub.
                You just need to replace <code>CHECKSUM1</code> and <code>CHECKSUM2</code> with the checksums from the getdescriptorinfo commands.
                The first descriptor is for receiving addresses (external), and the second is for change addresses (internal).
                Setting the timestamp to "now" initiates blockchain scanning from the current time, reducing rescan duration.
            </p>
        </div>
    );
}
