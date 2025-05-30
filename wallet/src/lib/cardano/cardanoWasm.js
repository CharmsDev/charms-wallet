'use client';

// This file provides a safe way to import the Cardano serialization library
// It ensures the library is only loaded in the browser environment

let CardanoWasm = null;

// Only import the library on the client side
if (typeof window !== 'undefined') {
    // Use the browser-compatible version
    import('@emurgo/cardano-serialization-lib-browser')
        .then((module) => {
            CardanoWasm = module;
        })
        .catch((error) => {
            console.error('Failed to load Cardano serialization library:', error);
        });
}

// Function to get the library instance
export const getCardanoWasm = () => {
    if (!CardanoWasm) {
        throw new Error('Cardano serialization library not loaded yet or failed to load');
    }
    return CardanoWasm;
};

// Function to check if the library is loaded
export const isCardanoWasmLoaded = () => {
    return !!CardanoWasm;
};

// Function to wait for the library to load
export const waitForCardanoWasm = async () => {
    if (CardanoWasm) return CardanoWasm;

    return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
            if (CardanoWasm) {
                clearInterval(checkInterval);
                resolve(CardanoWasm);
            }
        }, 100);

        // Timeout after 10 seconds
        setTimeout(() => {
            clearInterval(checkInterval);
            reject(new Error('Timeout waiting for Cardano serialization library to load'));
        }, 10000);
    });
};
