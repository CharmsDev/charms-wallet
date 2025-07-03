import { ProcessedCharm, UTXOMap } from '@/types';
import { fetchTransaction } from './utils/transaction-fetcher';
import { isNFT, isToken, getCharmDisplayName } from './utils/charm-utils';
// Dynamic import for charms-js to handle browser compatibility
let charmsJs: any = null;

async function getCharmsJs() {
    if (charmsJs) return charmsJs;

    try {
        // Import charms-js dynamically for both browser and server environments
        const charmsModule = await import('charms-js');
        console.log('[CHARMS] Raw charms module:', charmsModule);
        console.log('[CHARMS] Default export:', charmsModule.default);
        console.log('[CHARMS] Named exports:', Object.keys(charmsModule));

        // Try to use default export if available, otherwise use the module itself
        charmsJs = charmsModule.default || charmsModule;
        return charmsJs;
    } catch (error) {
        console.error('Failed to load charms-js:', error);
        return null;
    }
}

/**
 * Helper function to find the owner address for a transaction from the UTXOs
 */
function findOwnerAddress(utxos: UTXOMap, txId: string): string {
    return Object.entries(utxos).find(([addr, utxoList]) =>
        utxoList.some(utxo => utxo.txid === txId)
    )?.[0] || '';
}

/**
 * Service for handling Charms functionality
 * This is a facade that orchestrates the various modules
 */
class CharmsService {
    /**
     * Gets all charms from the provided UTXOs
     */
    async getCharmsByUTXOs(utxos: UTXOMap): Promise<ProcessedCharm[]> {
        try {
            console.log('[CHARMS] Starting charm detection process...');

            // Load charms-js dynamically
            const charms = await getCharmsJs();
            if (!charms) {
                console.error('[CHARMS] Failed to load charms-js library');
                return [];
            }

            console.log('[CHARMS] charms-js library loaded successfully');
            console.log('[CHARMS] Available functions in charms-js:', Object.keys(charms));

            // Use the correct API functions from charms-js v1.1.1
            const { decodeTransaction, hasCharmsData } = charms;

            if (!decodeTransaction) {
                console.error('[CHARMS] decodeTransaction function not found in charms-js');
                console.log('[CHARMS] Available functions:', Object.keys(charms));
                return [];
            }

            if (!hasCharmsData) {
                console.error('[CHARMS] hasCharmsData function not found in charms-js');
                return [];
            }

            // Get all unique transaction IDs
            const txIds = Array.from(new Set(Object.values(utxos).flat().map(utxo => utxo.txid)));
            console.log(`[CHARMS] Found ${txIds.length} unique transactions to check`);

            if (txIds.length === 0) {
                console.log('[CHARMS] No transactions found in UTXOs');
                return [];
            }

            // Fetch all transactions in parallel
            const transactions = await Promise.all(
                txIds.map(txId => fetchTransaction(txId))
            );

            const successfulFetches = transactions.filter(tx => tx !== null).length;
            console.log(`[CHARMS] Processing ${txIds.length} transactions, fetched ${successfulFetches} successfully`);

            if (successfulFetches === 0) {
                console.warn('[CHARMS] No transactions could be fetched');
                return [];
            }

            // Process all transactions
            const charmsArray: ProcessedCharm[] = [];

            for (let index = 0; index < transactions.length; index++) {
                const tx = transactions[index];
                if (!tx) {
                    continue;
                }

                const txId = txIds[index];
                const txHex = tx.toHex();

                // Check if transaction has charms data
                if (!hasCharmsData(txHex)) {
                    continue;
                }

                // Find the owner address for this transaction
                const ownerAddress = findOwnerAddress(utxos, txId);
                if (!ownerAddress) {
                    continue;
                }

                // Decode and extract charms from the transaction (async call)
                const charmsResult = await decodeTransaction(txHex);

                console.log(`[CHARMS] Decode result for tx ${txId.substring(0, 8)}:`, charmsResult);

                // Check if decoding was successful
                if (!charmsResult) {
                    console.log(`[CHARMS] No result returned for transaction ${txId.substring(0, 8)} (verification likely failed)`);
                    continue;
                }

                if ('error' in charmsResult) {
                    console.log(`[CHARMS] Error decoding transaction ${txId.substring(0, 8)}: ${charmsResult.error}`);
                    continue;
                }

                // Check if result is an array
                if (!Array.isArray(charmsResult)) {
                    console.log(`[CHARMS] Unexpected result type for transaction ${txId.substring(0, 8)}:`, typeof charmsResult, charmsResult);
                    continue;
                }

                console.log(`[CHARMS] Found ${charmsResult.length} charms in tx ${txId.substring(0, 8)}`);

                // Get all wallet addresses from UTXOs
                const walletAddresses = new Set(Object.keys(utxos));

                // Process each decoded charm
                for (const charmInstance of charmsResult) {
                    // Determine the charm's address
                    // Use the address from the CharmInstance
                    const charmAddress = charmInstance.address !== 'unknown' ? charmInstance.address : ownerAddress;

                    console.log(`[CHARMS] Charm ${charmInstance.appId} output ${charmInstance.utxo.index}: SDK address="${charmInstance.address}", final address="${charmAddress}"`);

                    // Check if the charm's address belongs to the wallet
                    const belongsToWallet = walletAddresses.has(charmAddress);

                    // Only process charms that belong to the wallet
                    if (belongsToWallet) {
                        // Determine the ticker and remaining values based on the charm data
                        let ticker: string;
                        let remaining: number;

                        // Check if the charm has a value property (token amount)
                        if (charmInstance.value !== undefined) {
                            // For tokens with a value property
                            ticker = charmInstance.ticker || 'CHARMS-TOKEN';
                            remaining = charmInstance.value;
                        } else {
                            // For NFTs or tokens with ticker/remaining properties
                            ticker = charmInstance.ticker || 'CHARMS-NFT';
                            remaining = charmInstance.remaining || 1;
                        }

                        // Create a ProcessedCharm object from the CharmInstance
                        const charm: ProcessedCharm = {
                            uniqueId: `${txId}-${charmInstance.appId}-${charmInstance.utxo.index}-${JSON.stringify({
                                ticker: ticker,
                                remaining: remaining
                            })}`,
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
                            app: charmInstance.app || '',
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
            console.error('Error getting charms by UTXOs:', error);
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
