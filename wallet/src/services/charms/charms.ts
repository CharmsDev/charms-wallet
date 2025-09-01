import { ProcessedCharm, UTXOMap } from '@/types';
import { isNFT, isToken, getCharmDisplayName } from './utils/charm-utils';
import { quickNodeService } from '@/services/shared/quicknode-service';
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
     * Gets all charms from the provided UTXOs using QuickNode for transaction data
     */
    async getCharmsByUTXOs(utxos: UTXOMap, network: 'mainnet' | 'testnet4'): Promise<ProcessedCharm[]> {
        try {
            // Load charms-js dynamically
            const charms = await getCharmsJs();
            if (!charms) {
                return [];
            }

            const { decodeTransaction } = charms;

            if (!decodeTransaction) {
                return [];
            }

            // Get all unique transaction IDs
            let txIds = Array.from(new Set(Object.values(utxos).flat().map(utxo => utxo.txid)));

            if (txIds.length === 0) {
                return [];
            }

            const charmsArray: ProcessedCharm[] = [];
            // Build a fast lookup of wallet outpoints to avoid address-format mismatches
            const walletOutpoints = new Set<string>();
            for (const [addr, list] of Object.entries(utxos)) {
                for (const u of list) {
                    walletOutpoints.add(`${u.txid}:${u.vout}`);
                }
            }

            for (const txId of txIds) {
                try {
                    // Get transaction hex from QuickNode instead of letting charms-js use mempool.space
                    const txHex = await quickNodeService.getTransactionHex(txId, network);
                    
                    if (!txHex) {
                        continue;
                    }

                    // Decode and extract charms using transaction hex directly
                    const charmsResult = await decodeTransaction(txHex, { network });

                    if (charmsResult && 'error' in charmsResult) {
                        continue;
                    }

                    if (!charmsResult || !Array.isArray(charmsResult)) {
                        continue;
                    }

                    for (const charmInstance of charmsResult) {
                        const outIndex = charmInstance.utxo?.index;
                        const belongsToWallet = outIndex !== undefined && walletOutpoints.has(`${txId}:${outIndex}`);

                        if (belongsToWallet) {
                            const ticker = charmInstance.name || charmInstance.ticker || (charmInstance.value !== undefined ? 'CHARMS-TOKEN' : 'CHARMS-NFT');
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
                                address: charmInstance.address,
                                commitTxId: null,
                                spellTxId: null
                            };

                            charmsArray.push(charm);
                        }
                    }
                } catch (error) {
                    // Skip this transaction if we can't fetch it
                    continue;
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
