import { CharmObj, UTXOMap } from '@/types';
import { isNFT, isToken, getCharmDisplayName } from './utils/charm-utils';
import { bitcoinApiRouter } from '../shared/bitcoin-api-router';
import { initializeWasm, isWasmAvailable, extractCharmsForWallet } from 'charms-js';

/**
 * WASM initialization for charm extraction
 * Uses charms-js NPM package v3.0.3 - WASM only, no fallbacks
 */
let wasmInitialized = false;

async function ensureWasmInitialized() {
    if (wasmInitialized) return;
    
    try {
        // Load the WASM bindings from the charms-js NPM package
        const wasmBindings = await import('charms-js/dist/wasm/charms_lib_bg.js');
        
        // Fetch the WASM binary from the public directory
        const wasmResponse = await fetch('/charms_lib_bg.wasm');
        if (!wasmResponse.ok) {
            throw new Error(`Failed to fetch WASM file: ${wasmResponse.status}`);
        }
        const wasmBuffer = await wasmResponse.arrayBuffer();
        
        // Instantiate the WASM module
        const wasmModule = await WebAssembly.instantiate(wasmBuffer, {
            './charms_lib_bg.js': wasmBindings
        });
        
        // Set up the WASM bindings
        wasmBindings.__wbg_set_wasm(wasmModule.instance.exports);
        
        // Initialize the WASM integration with the bindings
        initializeWasm(wasmBindings);
        
        wasmInitialized = true;
        console.log('✅ Charms WASM module initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize WASM:', error);
        throw new Error('WASM initialization failed');
    }
}

/**
 * Service for handling Charms functionality using charms-js v3.0.2
 * WASM-only implementation with official charms-lib integration
 */
class CharmsService {
    
    /**
     * Gets transaction hex from the API
     */
    private async getTransactionHex(txid: string): Promise<string | null> {
        try {
            const response = await bitcoinApiRouter.getTransactionHex(txid);
            return response;
        } catch (error) {
            console.error(`Failed to get transaction hex for ${txid}:`, error);
            return null;
        }
    }
    
    /**
     * Gets all charms from the provided UTXOs using WASM-only extraction
     */
    async getCharmsByUTXOs(utxos: UTXOMap, network: 'mainnet' | 'testnet4' = 'testnet4'): Promise<CharmObj[]> {
        try {
            // Ensure WASM is initialized for optimal performance
            await ensureWasmInitialized();
            
            // Get all unique transaction IDs
            const txIds = Array.from(new Set(
                Object.values(utxos).flat().map((utxo: any) => utxo.txid)
            ));

            if (txIds.length === 0) {
                return [];
            }

            const allCharms: CharmObj[] = [];
            
            // Build wallet outpoints lookup for ownership verification
            const walletOutpoints = new Set<string>();
            for (const [addr, list] of Object.entries(utxos)) {
                for (const utxo of list as any[]) {
                    walletOutpoints.add(`${utxo.txid}:${utxo.vout}`);
                }
            }
            
            // Process each unique transaction
            for (const txId of txIds) {
                try {
                    // Get transaction hex
                    const txHex = await this.getTransactionHex(txId);
                    if (!txHex) {
                        console.warn(`Could not fetch transaction hex for ${txId}`);
                        continue;
                    }
                    
                    // Extract and normalize charms using charms-js wallet adapter
                    const processedCharms = await extractCharmsForWallet(
                        txHex, 
                        txId, 
                        walletOutpoints, 
                        network
                    );
                    
                    allCharms.push(...processedCharms);
                    
                } catch (error) {
                    console.error(`Error processing charms for transaction ${txId}:`, error);
                }
            }
            
            return allCharms;
            
        } catch (error) {
            console.error('Error in getCharmsByUTXOs:', error);
            return [];
        }
    }

    // Utility methods
    isNFT(charm: CharmObj): boolean {
        return isNFT(charm);
    }

    isToken(charm: CharmObj): boolean {
        return isToken(charm);
    }

    getCharmDisplayName(charm: CharmObj): string {
        return getCharmDisplayName(charm);
    }
}

export const charmsService = new CharmsService();
