// UTXO Verifier - Verifies UTXO status and updates storage when spent
import { getUTXOs, saveUTXOs } from '@/services/storage';
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';
import { quickNodeService } from '@/services/bitcoin/quicknode-service';
import { utxoCache } from '@/services/shared/cache-service';

export class UTXOVerifier {
    constructor() {
        // Using unified cache service instead of local cache
    }

    clearCache() {
        console.log('[UTXOVerifier] Clearing verification cache');
        utxoCache.clearAll();
    }

    clearCacheForUtxo(utxoKey) {
        console.log(`[UTXOVerifier] Clearing cache for UTXO: ${utxoKey}`);
        utxoCache.clear(utxoKey);
    }

    async verifyAndUpdateUTXO(utxo, updateStateCallback = null, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        const utxoKey = `${utxo.txid}:${utxo.vout}`;
        console.log(`[UTXOVerifier] Verifying UTXO: ${utxoKey}`);

        try {
            // Check cache first using unified cache service
            const cachedResult = utxoCache.get(utxoKey);
            if (cachedResult !== null) {
                console.log(`[UTXOVerifier] Using cached result for ${utxoKey}: ${cachedResult}`);
                return cachedResult;
            }

            console.log(`[UTXOVerifier] Checking API status for ${utxoKey}`);
            const isUnspent = await this.checkUTXOStatus(utxo, network);
            console.log(`[UTXOVerifier] API result for ${utxoKey}: ${isUnspent ? 'UNSPENT' : 'SPENT'}`);

            // Cache the result using unified cache service
            utxoCache.set(utxoKey, isUnspent);

            // If UTXO is spent, update storage and state
            if (!isUnspent) {
                console.log(`[UTXOVerifier] UTXO ${utxoKey} is SPENT - updating storage and state`);
                await this.removeSpentUTXOFromStorage(utxo, blockchain, network);

                if (updateStateCallback && typeof updateStateCallback === 'function') {
                    await updateStateCallback([utxo], {}, blockchain, network);
                }
            }

            return isUnspent;

        } catch (error) {
            console.error(`[UTXOVerifier] Failed to verify UTXO ${utxoKey}:`, error);
            return false;
        }
    }

    async checkUTXOStatus(utxo, network = NETWORKS.BITCOIN.TESTNET) {
        try {
            // Prefer QuickNode if configured: use gettxout (authoritative)
            if (quickNodeService && quickNodeService.isAvailable()) {
                console.log(`[UTXOVerifier] Using QuickNode gettxout for ${utxo.txid}:${utxo.vout}`);
                const isSpent = await quickNodeService.isUtxoSpent(utxo.txid, utxo.vout);
                const isUnspent = !isSpent;
                console.log(`[UTXOVerifier] QuickNode result for ${utxo.txid}:${utxo.vout}: ${isUnspent ? 'UNSPENT' : 'SPENT'}`);
                return isUnspent;
            }

            // Fallback to mempool.space outspend endpoint
            const isMainnet = network === NETWORKS.BITCOIN.MAINNET;
            const baseUrl = isMainnet
                ? 'https://mempool.space/api'
                : 'https://mempool.space/testnet4/api';
            const url = `${baseUrl}/tx/${utxo.txid}/outspend/${utxo.vout}`;
            console.log(`[UTXOVerifier] Fetching: ${url}`);

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
                signal: AbortSignal.timeout(10000)
            });

            if (response.ok) {
                const outspendData = await response.json();
                const isUnspent = !outspendData.spent;
                console.log(`[UTXOVerifier] UTXO ${utxo.txid}:${utxo.vout} is ${isUnspent ? 'UNSPENT' : 'SPENT'}`);
                return isUnspent;
            } else if (response.status === 404) {
                console.log(`[UTXOVerifier] UTXO ${utxo.txid}:${utxo.vout} not found (404) - assuming SPENT`);
                return false;
            } else {
                console.warn(`[UTXOVerifier] HTTP ${response.status} for UTXO ${utxo.txid}:${utxo.vout} - assuming SPENT`);
                return false;
            }
        } catch (error) {
            console.error(`[UTXOVerifier] Error checking UTXO ${utxo.txid}:${utxo.vout}:`, error);
            return false;
        }
    }

    async removeSpentUTXOFromStorage(spentUtxo, blockchain, network) {
        try {
            console.log(`[UTXOVerifier] Removing spent UTXO ${spentUtxo.txid}:${spentUtxo.vout} from storage`);

            const storedUTXOs = await getUTXOs(blockchain, network);
            const utxoIdToRemove = `${spentUtxo.txid}:${spentUtxo.vout}`;

            // Remove the spent UTXO from all addresses
            Object.keys(storedUTXOs).forEach(address => {
                storedUTXOs[address] = storedUTXOs[address].filter(
                    utxo => `${utxo.txid}:${utxo.vout}` !== utxoIdToRemove
                );

                // Clean up empty address entries
                if (storedUTXOs[address].length === 0) {
                    delete storedUTXOs[address];
                }
            });

            await saveUTXOs(storedUTXOs, blockchain, network);
            console.log(`[UTXOVerifier] Successfully removed spent UTXO from storage`);

        } catch (error) {
            console.error(`[UTXOVerifier] Failed to remove spent UTXO from storage:`, error);
        }
    }

    async removeUtxo(txid, vout, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        const utxo = { txid, vout };
        await this.removeSpentUTXOFromStorage(utxo, blockchain, network);

        // Clear cache for this UTXO
        const utxoKey = `${txid}:${vout}`;
        this.clearCacheForUtxo(utxoKey);

        console.log(`[UTXOVerifier] Removed UTXO ${utxoKey} via removeUtxo method`);
    }

    getCacheStats() {
        return utxoCache.getStats();
    }
}

export const utxoVerifier = new UTXOVerifier();
export default utxoVerifier;
