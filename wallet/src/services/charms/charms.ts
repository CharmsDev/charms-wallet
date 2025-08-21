import { ProcessedCharm, UTXOMap } from '@/types';
import { isNFT, isToken, getCharmDisplayName } from './utils/charm-utils';
// Dynamic import for charms-js to handle browser compatibility
let charmsJs: any = null;

async function getCharmsJs() {
    if (charmsJs) {
        return charmsJs;
    }

    try {
        console.log('[CHARMS] Loading charms-js library...');
        charmsJs = await import('charms-js');
        console.log('[CHARMS] charms-js library loaded successfully');
        return charmsJs;
    } catch (error) {
        console.error('[CHARMS] Failed to load charms-js library:', error);
        return null;
    }
}

/**
 * Service for handling Charms functionality
 * This is a facade that orchestrates the various modules
 */
class CharmsService {
    /**
     * Gets all charms from the provided UTXOs using the new charms-js v2 API
     */
    async getCharmsByUTXOs(utxos: UTXOMap, network: 'mainnet' | 'testnet4'): Promise<ProcessedCharm[]> {
        try {
            console.log(`[CHARMS] Starting charm detection on network: ${network}`);

            // Load charms-js dynamically
            const charms = await getCharmsJs();
            if (!charms) {
                console.error('[CHARMS] Failed to load charms-js library');
                return [];
            }

            const { decodeTransactionById } = charms;

            if (!decodeTransactionById) {
                console.error('[CHARMS] decodeTransactionById function not found in charms-js. Available functions:', Object.keys(charms));
                return [];
            }

            // Get all unique transaction IDs
            const txIds = Array.from(new Set(Object.values(utxos).flat().map(utxo => utxo.txid)));

            console.log(`[CHARMS] Found ${txIds.length} unique transactions to check`);

            if (txIds.length === 0) {
                return [];
            }

            const charmsArray: ProcessedCharm[] = [];
            const walletAddresses = new Set(Object.keys(utxos));

            for (const txId of txIds) {
                // Decode and extract charms using the new API
                const charmsResult = await decodeTransactionById(txId, { network });

                if (charmsResult && 'error' in charmsResult) {
                    // Log errors but don't stop processing other transactions
                    console.log(`[CHARMS] Skipping tx ${txId.substring(0, 8)} due to error: ${charmsResult.error}`);
                    continue;
                }

                if (!charmsResult || !Array.isArray(charmsResult)) {
                    console.log(`[CHARMS] No valid charms found for tx ${txId.substring(0, 8)}.`);
                    continue;
                }

                console.log(`[CHARMS] Found ${charmsResult.length} charms in tx ${txId.substring(0, 8)}`);

                for (const charmInstance of charmsResult) {
                    const charmAddress = charmInstance.address;

                    // Only process charms that belong to wallet addresses
                    const belongsToWallet = walletAddresses.has(charmAddress);

                    if (belongsToWallet) {
                        const ticker = charmInstance.ticker || (charmInstance.value !== undefined ? 'CHARMS-TOKEN' : 'CHARMS-NFT');
                        const remaining = charmInstance.value ?? charmInstance.remaining ?? 1;

                        const charm: ProcessedCharm = {
                            uniqueId: `${txId}-${charmInstance.appId}-${charmInstance.utxo.index}`,
                            id: charmInstance.appId,
                            amount: {
                                ticker: ticker,
                                remaining: remaining,
                                name: charmInstance.name,
                                description: charmInstance.description,
                                image: charmInstance.image,
                                image_hash: charmInstance.image_hash,
                                url: charmInstance.url
                            },
                            app: charmInstance.app,
                            outputIndex: charmInstance.utxo.index,
                            txid: txId,
                            address: charmAddress,
                            commitTxId: null,
                            spellTxId: null
                        };

                        charmsArray.push(charm);
                        console.log(`[CHARMS] Added ${ticker} (${remaining}) to wallet`);
                    }
                }
            }

            return charmsArray;
        } catch (error) {
            console.error('Error in getCharmsByUTXOs:', error);
            return [];
        }
    }

    // Expose utility methods
    isNFT(charm: ProcessedCharm): boolean {
        return isNFT(charm);
    }

    isToken(charm: ProcessedCharm): boolean {
        return isToken(charm);
    }

    getCharmDisplayName(charm: ProcessedCharm): string {
        return getCharmDisplayName(charm);
    }
}

export const charmsService = new CharmsService();
