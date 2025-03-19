'use client';

export default function WalletInfoDisplay({ walletInfo, onCopy }) {
    return (
        <div className="bg-blue-50 p-4 rounded-md">
            <h2 className="text-lg font-semibold mb-3">Wallet Information:</h2>
            {walletInfo.derivationLoading ? (
                <div className="flex justify-center items-center h-40">
                    <p>Deriving wallet information...</p>
                </div>
            ) : (
                <div className="space-y-4">
                    <div>
                        <h3 className="font-medium text-blue-800">Master Key Fingerprint:</h3>
                        <div className="relative">
                            <div className="bg-white p-2 rounded border border-gray-300 font-mono text-sm break-all">
                                {walletInfo.fingerprint || 'Not available'}
                            </div>
                            {walletInfo.fingerprint && (
                                <button
                                    onClick={() => onCopy(walletInfo.fingerprint)}
                                    className="absolute top-1 right-1 bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-0.5 rounded text-xs"
                                >
                                    Copy
                                </button>
                            )}
                        </div>
                    </div>

                    <div>
                        <h3 className="font-medium text-blue-800">Derivation Path (Taproot):</h3>
                        <div className="relative">
                            <div className="bg-white p-2 rounded border border-gray-300 font-mono text-sm">
                                m/{walletInfo.path || '86h/0h/0h'}
                            </div>
                            <button
                                onClick={() => onCopy(`m/${walletInfo.path}`)}
                                className="absolute top-1 right-1 bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-0.5 rounded text-xs"
                            >
                                Copy
                            </button>
                        </div>
                    </div>

                    <div>
                        <h3 className="font-medium text-blue-800">Extended Public Key (xpub):</h3>
                        <div className="relative">
                            <div className="bg-white p-2 rounded border border-gray-300 font-mono text-sm break-all">
                                {walletInfo.xpub || 'Not available'}
                            </div>
                            {walletInfo.xpub && (
                                <button
                                    onClick={() => onCopy(walletInfo.xpub)}
                                    className="absolute top-1 right-1 bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-0.5 rounded text-xs"
                                >
                                    Copy
                                </button>
                            )}
                        </div>
                    </div>

                    <div>
                        <h3 className="font-medium text-blue-800">Extended Private Key (xpriv):</h3>
                        <div className="relative">
                            <div className="bg-white p-2 rounded border border-gray-300 font-mono text-sm break-all">
                                {walletInfo.xpriv ? '••••••••••••••••••••••••••••••••••••••••••••••••••' : 'Not available'}
                            </div>
                            {walletInfo.xpriv && (
                                <button
                                    onClick={() => onCopy(walletInfo.xpriv)}
                                    className="absolute top-1 right-1 bg-gray-200 hover:bg-gray-300 text-gray-700 px-2 py-0.5 rounded text-xs"
                                >
                                    Copy
                                </button>
                            )}
                        </div>
                        <p className="text-xs text-red-600 mt-1">
                            <strong>Warning:</strong> Never share your extended private key with anyone.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
