// UTXO Verifier - Verifies UTXO status and updates storage when spent
import { getUTXOs, saveUTXOs } from '@/services/storage';
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';

export class UTXOVerifier {
    constructor() {
        this.verificationCache = new Map();
        this.cacheTimeout = 30000; // 30 seconds cache
    }

    clearCache() {
        console.log('[UTXOVerifier] Clearing verification cache');
        this.verificationCache.clear();
    }

    clearCacheForUtxo(utxoKey) {
        console.log(`[UTXOVerifier] Clearing cache for UTXO: ${utxoKey}`);
        this.verificationCache.delete(utxoKey);
    }

    async verifyAndUpdateUTXO(utxo, updateStateCallback = null, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        const utxoKey = `${utxo.txid}:${utxo.vout}`;
        console.log(`[UTXOVerifier] Verifying UTXO: ${utxoKey}`);

        try {
            // Check cache first
            if (this.verificationCache.has(utxoKey)) {
                const cachedResult = this.verificationCache.get(utxoKey);
                if (Date.now() - cachedResult.timestamp < this.cacheTimeout) {
                    console.log(`[UTXOVerifier] Using cached result for ${utxoKey}: ${cachedResult.isUnspent}`);
                    return cachedResult.isUnspent;
                }
            }

            console.log(`[UTXOVerifier] Checking API status for ${utxoKey}`);
            const isUnspent = await this.checkUTXOStatus(utxo);
            console.log(`[UTXOVerifier] API result for ${utxoKey}: ${isUnspent ? 'UNSPENT' : 'SPENT'}`);

            // Cache the result
            this.verificationCache.set(utxoKey, {
                isUnspent,
                timestamp: Date.now()
            });

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

    async checkUTXOStatus(utxo) {
        try {
            const url = `https://mempool.space/testnet4/api/tx/${utxo.txid}/outspend/${utxo.vout}`;
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

    getCacheStats() {
        return {
            size: this.verificationCache.size,
            entries: Array.from(this.verificationCache.entries()).map(([key, value]) => ({
                utxo: key,
                isUnspent: value.isUnspent,
                age: Date.now() - value.timestamp
            }))
        };
    }
}

export const utxoVerifier = new UTXOVerifier();
export default utxoVerifier;
