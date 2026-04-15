'use client';

// This file provides a safe way to import the Cardano serialization library.
// Uses the asmjs version (pure JS, no WASM) to avoid Next.js bundler issues.

let CardanoWasm = null;

if (typeof window !== 'undefined') {
    import('@emurgo/cardano-serialization-lib-asmjs')
        .then((module) => {
            CardanoWasm = module;
        })
        .catch((error) => {
            console.error('Failed to load Cardano serialization library:', error);
        });
}

export const getCardanoWasm = () => {
    if (!CardanoWasm) {
        throw new Error('Cardano serialization library not loaded yet or failed to load');
    }
    return CardanoWasm;
};

export const isCardanoWasmLoaded = () => {
    return !!CardanoWasm;
};

export const waitForCardanoWasm = async () => {
    if (CardanoWasm) return CardanoWasm;

    return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
            if (CardanoWasm) {
                clearInterval(checkInterval);
                resolve(CardanoWasm);
            }
        }, 100);

        setTimeout(() => {
            clearInterval(checkInterval);
            reject(new Error('Timeout waiting for Cardano serialization library to load'));
        }, 10000);
    });
};
