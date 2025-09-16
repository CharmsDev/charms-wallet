import { CharmObj, UTXOMap } from '@/types';
import { isNFT, isToken, getCharmDisplayName } from './utils/charm-utils';
import { bitcoinApiRouter } from '../shared/bitcoin-api-router';
import { extractAndVerifySpell } from 'charms-js';

/**
 * Service for handling Charms functionality using charms-js library
 * Provides both batch and progressive charm extraction from UTXOs
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
            return null;
        }
    }
    
    /**
     * Extracts all charms from the provided UTXOs
     * @param utxos - Map of UTXOs to scan for charms
     * @param network - Bitcoin network (mainnet or testnet4)
     * @returns Array of validated CharmObj instances
     */
    async getCharmsByUTXOs(utxos: UTXOMap, network: 'mainnet' | 'testnet4' = 'testnet4'): Promise<CharmObj[]> {
        try {
            // Get all unique transaction IDs
            const txIds = Array.from(new Set(
                Object.values(utxos).flat().map((utxo: any) => utxo.txid)
            ));

            if (txIds.length === 0) {
                return [];
            }

            const allCharms: CharmObj[] = [];
            
            // Process each unique transaction
            for (const txId of txIds) {
                try {
                    // Get transaction hex
                    const txHex = await this.getTransactionHex(txId);
                    if (!txHex) {
                        continue;
                    }
                    
                    // Extract and verify charms using charms-js library
                    const result = await extractAndVerifySpell(txHex, network);
                    
                    if (result.success && result.charms.length > 0) {
                        allCharms.push(...result.charms);
                    }
                    
                } catch (error) {
                    // Continue processing other transactions on error
                }
            }
            
            return allCharms;
            
        } catch (error) {
            return [];
        }
    }

    /**
     * Extracts charms progressively with real-time callbacks
     * @param utxos - Map of UTXOs to scan for charms
     * @param network - Bitcoin network (mainnet or testnet4)
     * @param onCharmFound - Callback executed for each charm found
     * @param onProgress - Callback for progress updates
     */
    async getCharmsByUTXOsProgressive(
        utxos: UTXOMap, 
        network: 'mainnet' | 'testnet4' = 'testnet4',
        onCharmFound: (charm: CharmObj) => Promise<void>,
        onProgress: (current: number, total: number) => void
    ): Promise<void> {
        try {
            // Get all unique transaction IDs
            const txIds = Array.from(new Set(
                Object.values(utxos).flat().map((utxo: any) => utxo.txid)
            ));

            if (txIds.length === 0) {
                return;
            }

            // Process each unique transaction progressively
            for (let i = 0; i < txIds.length; i++) {
                const txId = txIds[i];
                onProgress(i, txIds.length);
                
                try {
                    // Get transaction hex
                    const txHex = await this.getTransactionHex(txId);
                    if (!txHex) {
                        continue;
                    }
                    
                    // Extract and verify charms using charms-js library
                    const result = await extractAndVerifySpell(txHex, network);
                    
                    if (result.success && result.charms.length > 0) {
                        // Process each charm individually for progressive display
                        for (const charm of result.charms) {
                            // Ensure required fields are set
                            charm.txid = txId;
                            
                            if (charm.outputIndex === undefined || charm.outputIndex === null) {
                                continue;
                            }
                            
                            await onCharmFound(charm);
                        }
                    }
                    
                } catch (error) {
                    // Continue processing other transactions on error
                }
            }
            
            onProgress(txIds.length, txIds.length);
            
        } catch (error) {
            // Handle errors gracefully
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
