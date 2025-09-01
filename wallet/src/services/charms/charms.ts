import { ProcessedCharm, UTXOMap } from '@/types';
import { isNFT, isToken, getCharmDisplayName } from './utils/charm-utils';
// Dynamic import for charms-js to handle browser compatibility
let charmsJs: any = null;

async function getCharmsJs() {
    if (charmsJs) {
        return charmsJs;
    }

    try {
        charmsJs = await import('charms-js');
        return charmsJs;
    } catch (error) {
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
            // Load charms-js dynamically
            const charms = await getCharmsJs();
            if (!charms) {
                return [];
            }

            const { decodeTransactionById } = charms;

            if (!decodeTransactionById) {
                return [];
            }

            // Get all unique transaction IDs
            let txIds = Array.from(new Set(Object.values(utxos).flat().map(utxo => utxo.txid)));

            if (txIds.length === 0) {
                return [];
            }

            const charmsArray: ProcessedCharm[] = [];
            const walletAddresses = new Set(Object.keys(utxos));

            for (const txId of txIds) {
                // Decode and extract charms using the new API
                const charmsResult = await decodeTransactionById(txId, { network });

                if (charmsResult && 'error' in charmsResult) {
                    continue;
                }

                if (!charmsResult || !Array.isArray(charmsResult)) {
                    continue;
                }

                for (const charmInstance of charmsResult) {
                    try {
                    } catch {}
                    const charmAddress = charmInstance.address;

                    // Only process charms that belong to wallet addresses
                    const belongsToWallet = walletAddresses.has(charmAddress);

                    if (belongsToWallet) {
                        const ticker = charmInstance.name || charmInstance.ticker || (charmInstance.value !== undefined ? 'CHARMS-TOKEN' : 'CHARMS-NFT');
                        const remaining = charmInstance.value ?? charmInstance.remaining ?? 1;
                        try {
                        } catch {}

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
                    }
                }
            }

            return charmsArray;
        } catch (error) {
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
