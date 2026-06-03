'use client';

import { useState } from 'react';

export default function SeedPhraseDisplay({ seedPhrase, onCopy }) {
    const [isVisible, setIsVisible] = useState(false);

    const toggleVisibility = () => {
        setIsVisible(!isVisible);
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-bold gradient-text">Your Seed Phrase:</h2>
                <button
                    onClick={toggleVisibility}
                    className="flex items-center gap-2 px-3 py-1 bg-dark-700 hover:bg-dark-600 rounded-lg border border-dark-600 transition-colors"
                    title={isVisible ? "Hide seed phrase" : "Show seed phrase"}
                >
                    {isVisible ? (
                        <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                        </svg>
                    ) : (
                        <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                    )}
                    <span className="text-sm text-gray-300">
                        {isVisible ? 'Hide' : 'Show'}
                    </span>
                </button>
            </div>
            <p className="text-yellow-300 text-sm mb-3">
                <strong>Important:</strong> Keep your seed phrase safe. It's the only way to recover your wallet.
            </p>
            <div>
                <div className="grid grid-cols-2 gap-2 mb-4">
                    {seedPhrase.split(' ').map((word, index) => (
                        <div key={index} className="bg-dark-800 p-2 rounded-lg border border-dark-700">
                            <span className="text-primary-400 mr-1">{index + 1}.</span>
                            <span className="text-white">
                                {isVisible ? word : '••••••••'}
                            </span>
                        </div>
                    ))}
                </div>
                <button
                    onClick={() => onCopy(seedPhrase)}
                    className="btn btn-secondary w-full"
                    disabled={!isVisible}
                    title={!isVisible ? "Show seed phrase first to copy" : "Copy seed phrase"}
                >
                    Copy Seed Phrase
                </button>
            </div>
        </div>
    );
}
