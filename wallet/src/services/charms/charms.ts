import { ProcessedCharm, UTXOMap } from '@/types';
import { isNFT, isToken, getCharmDisplayName } from './utils/charm-utils';
import { quickNodeService } from '../shared/quicknode-service';
import { extractAppInputsByVout } from './cbor-extractor';

/**
 * Attempts to reconstruct a canonical Charm APP ID from `app_public_inputs`.
 * This is necessary when the `appId` from `charms-js` is a placeholder like '$0000'.
 * It searches for `app_public_inputs` in various possible locations within the charm data,
 * parses it, and reconstructs the `t/<hash1>/<hash2>` format.
 *
 * @param charmInstance - The charm instance object from charms-js.
 * @param appPublicInputs - Optional pre-extracted `app_public_inputs` from a CBOR extractor.
 * @returns The reconstructed APP ID, or the original `appId` if reconstruction fails.
 */
function reconstructAppId(charmInstance: any, appPublicInputs?: any): string {
    // If a valid appId already exists, use it directly.
    if (charmInstance.appId && charmInstance.appId !== '$0000') {
        return charmInstance.appId;
    }

    // Gather potential sources of app_public_inputs from the charm object.
    const candidates: any[] = [
        appPublicInputs, // Pre-extracted inputs have priority.
        charmInstance.app_public_inputs,
        charmInstance.appPublicInputs,
        charmInstance.publicInputs,
        charmInstance.inputs,
        charmInstance.data?.app_public_inputs,
        charmInstance.spell?.app_public_inputs
    ].filter(Boolean);

    // Helper to normalize various data structures into a string.
    const toStringCandidate = (src: any): string | null => {
        if (typeof src === 'string') return src;
        if (Array.isArray(src)) return src.join(',');
        if (typeof src === 'object') {
            for (const [k, v] of Object.entries(src)) {
                if (typeof v === 'string' && v.startsWith('t,')) return v;
                if (typeof k === 'string' && k.startsWith('t,')) return k;
            }
        }
        return null;
    };

    for (const candidate of candidates) {
        const inputStr = toStringCandidate(candidate);
        if (!inputStr || !inputStr.startsWith('t,')) continue;

        try {
            const parts = inputStr.split(',');
            // A valid App ID requires 't' plus 64 bytes for the two hashes.
            if (parts.length >= 65) {
                const hash1Bytes = parts.slice(1, 33).map(x => parseInt(x.trim(), 10));
                const hash1 = Buffer.from(hash1Bytes).toString('hex');
                const hash2Bytes = parts.slice(33, 65).map(x => parseInt(x.trim(), 10));
                const hash2 = Buffer.from(hash2Bytes).toString('hex');
                return `t/${hash1}/${hash2}`;
            }
        } catch (error) {
            // Ignore parsing errors and try the next candidate.
            continue;
        }
    }

    // Fallback to the original appId if reconstruction is not possible.
    return charmInstance.appId || '$0000';
}

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

                    // Extract app_public_inputs using CBOR extractor as fallback
                    const appInputsByVout = extractAppInputsByVout(txHex);
                    
                    for (const charmInstance of charmsResult) {
                        const outIndex = charmInstance.utxo?.index;
                        const belongsToWallet = outIndex !== undefined && walletOutpoints.has(`${txId}:${outIndex}`);

                        if (belongsToWallet) {
                            // Try to get app_public_inputs from CBOR extractor
                            const appInputs = (outIndex !== undefined) ? appInputsByVout.get(outIndex) : undefined;
                            
                            const reconstructedAppId = reconstructAppId(charmInstance, appInputs);
                            
                            const ticker = charmInstance.name || charmInstance.ticker || (charmInstance.value !== undefined ? 'CHARMS-TOKEN' : 'CHARMS-NFT');
                            const remaining = charmInstance.value ?? charmInstance.remaining ?? 1;

                            const charm: ProcessedCharm = {
                                uniqueId: `${txId}-${reconstructedAppId}-${charmInstance.utxo.index}`,
                                id: reconstructedAppId,
                                appId: reconstructedAppId, // Add explicit appId field for easier access
                                amount: {
                                    ticker: ticker,
                                    remaining: remaining,
                                    name: charmInstance.name,
                                    description: charmInstance.description,
                                    image: charmInstance.image,
                                    image_hash: charmInstance.image_hash,
                                    url: charmInstance.url,
                                    appId: reconstructedAppId // Add reconstructed appId to amount object too
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
