"use client";

import { createContext, useContext, useState, useEffect } from 'react';

// Create WASM context
const WasmContext = createContext();

// Hook to use WASM context
export const useWasm = () => {
    const context = useContext(WasmContext);
    if (!context) {
        throw new Error('useWasm must be used within a WasmProvider');
    }
    return context;
};

// Global WASM module reference for non-React contexts
let globalWasmModule = null;

// Function to get WASM module in services (non-React contexts)
export const getGlobalWasmModule = () => globalWasmModule;

// WASM provider component - loads charms-lib WASM module once globally
export function WasmProvider({ children }) {
    const [wasmModule, setWasmModule] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const loadWasm = async () => {
            try {
                setIsLoading(true);
                setError(null);
                
                // Import the local charms-lib module
                const module = await import('@/lib/charms-lib/charms_lib.js');
                
                // Set both local state and global reference
                setWasmModule(module);
                globalWasmModule = module;
                
            } catch (err) {
                console.error('Error loading charms WASM module:', err);
                setError(err);
            } finally {
                setIsLoading(false);
            }
        };

        loadWasm();
    }, []);

    // Provide convenient wrapper functions
    const extractAndVerifySpell = async (tx, mock = false) => {
        if (!wasmModule?.extractAndVerifySpell) {
            throw new Error('WASM module not ready or extractAndVerifySpell not available');
        }
        return wasmModule.extractAndVerifySpell(tx, mock);
    };

    const contextValue = {
        wasmModule,
        isLoading,
        error,
        isReady: !isLoading && !error && wasmModule !== null,
        // Convenient wrapper functions
        extractAndVerifySpell
    };

    return (
        <WasmContext.Provider value={contextValue}>
            {children}
        </WasmContext.Provider>
    );
}