'use client';

import { useState } from 'react';

export default function SeedPhraseDisplay({ seedPhrase, onCopy }) {
    return (
        <div>
            <h2 className="text-lg font-bold gradient-text mb-3">Your Seed Phrase:</h2>
            <p className="text-yellow-300 text-sm mb-3">
                <strong>Important:</strong> Keep your seed phrase safe. It's the only way to recover your wallet.
            </p>
            <div>
                <div className="grid grid-cols-2 gap-2 mb-4">
                    {seedPhrase.split(' ').map((word, index) => (
                        <div key={index} className="bg-dark-800 p-2 rounded-lg border border-dark-700">
                            <span className="text-primary-400 mr-1">{index + 1}.</span> <span className="text-white">{word}</span>
                        </div>
                    ))}
                </div>
                <button
                    onClick={() => onCopy(seedPhrase)}
                    className="btn btn-secondary w-full"
                >
                    Copy Seed Phrase
                </button>
            </div>
        </div>
    );
}
