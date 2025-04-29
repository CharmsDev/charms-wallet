'use client';

export default function WalletInfoDisplay({ walletInfo, onCopy }) {
    return (
        <div className="bg-dark-800/50 p-4 rounded-xl border border-dark-700">
            <h2 className="text-lg font-bold gradient-text mb-3">Wallet Information:</h2>
            {walletInfo.derivationLoading ? (
                <div className="flex justify-center items-center h-40">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
                    <p className="ml-2 text-dark-300">Deriving wallet information...</p>
                </div>
            ) : (
                <div className="space-y-4">
                    <div>
                        <h3 className="font-medium text-primary-400">Master Key Fingerprint:</h3>
                        <div className="relative">
                            <div className="bg-dark-900 p-2 rounded-lg border border-dark-700 font-mono text-sm break-all text-white">
                                {walletInfo.fingerprint || 'Not available'}
                            </div>
                            {walletInfo.fingerprint && (
                                <button
                                    onClick={() => onCopy(walletInfo.fingerprint)}
                                    className="absolute top-1 right-1 bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white px-2 py-0.5 rounded-full text-xs"
                                >
                                    Copy
                                </button>
                            )}
                        </div>
                    </div>

                    <div>
                        <h3 className="font-medium text-primary-400">Derivation Path (Taproot):</h3>
                        <div className="relative">
                            <div className="bg-dark-900 p-2 rounded-lg border border-dark-700 font-mono text-sm text-white">
                                m/{walletInfo.path || '86h/0h/0h'}
                            </div>
                            <button
                                onClick={() => onCopy(`m/${walletInfo.path}`)}
                                className="absolute top-1 right-1 bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white px-2 py-0.5 rounded-full text-xs"
                            >
                                Copy
                            </button>
                        </div>
                    </div>

                    <div>
                        <h3 className="font-medium text-primary-400">Extended Public Key (xpub):</h3>
                        <div className="relative">
                            <div className="bg-dark-900 p-2 rounded-lg border border-dark-700 font-mono text-sm break-all text-white">
                                {walletInfo.xpub || 'Not available'}
                            </div>
                            {walletInfo.xpub && (
                                <button
                                    onClick={() => onCopy(walletInfo.xpub)}
                                    className="absolute top-1 right-1 bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white px-2 py-0.5 rounded-full text-xs"
                                >
                                    Copy
                                </button>
                            )}
                        </div>
                    </div>

                    <div>
                        <h3 className="font-medium text-primary-400">Extended Private Key (xpriv):</h3>
                        <div className="relative">
                            <div className="bg-dark-900 p-2 rounded-lg border border-dark-700 font-mono text-sm break-all text-white">
                                {walletInfo.xpriv ? '••••••••••••••••••••••••••••••••••••••••••••••••••' : 'Not available'}
                            </div>
                            {walletInfo.xpriv && (
                                <button
                                    onClick={() => onCopy(walletInfo.xpriv)}
                                    className="absolute top-1 right-1 bg-dark-700 hover:bg-dark-600 text-dark-300 hover:text-white px-2 py-0.5 rounded-full text-xs"
                                >
                                    Copy
                                </button>
                            )}
                        </div>
                        <p className="text-xs text-red-400 mt-1">
                            <strong>Warning:</strong> Never share your extended private key with anyone.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
