'use client';

import { useState } from 'react';

export default function SeedPhraseDisplay({ seedPhrase, onCopy }) {
    return (
        <div>
            <h2 className="text-lg font-semibold mb-3">Your Seed Phrase:</h2>
            <div>
                <div className="grid grid-cols-2 gap-2 mb-4">
                    {seedPhrase.split(' ').map((word, index) => (
                        <div key={index} className="bg-white p-2 rounded border border-gray-300">
                            <span className="text-gray-500 mr-1">{index + 1}.</span> {word}
                        </div>
                    ))}
                </div>
                <button
                    onClick={() => onCopy(seedPhrase)}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded text-sm w-full"
                >
                    Copy Seed Phrase
                </button>
            </div>
        </div>
    );
}
