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
        utxoCache.clearAll();
    }

    clearCacheForUtxo(utxoKey) {
        utxoCache.clear(utxoKey);
    }

    async verifyAndUpdateUTXO(utxo, updateStateCallback = null, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        const utxoKey = `${utxo.txid}:${utxo.vout}`;

        try {
            const cachedResult = utxoCache.get(utxoKey);
            if (cachedResult !== null) {
                return cachedResult;
            }

            const isUnspent = await this.checkUTXOStatus(utxo, network);
            utxoCache.set(utxoKey, isUnspent);

            if (!isUnspent) {
                await this.removeSpentUTXOFromStorage(utxo, blockchain, network);

                if (updateStateCallback && typeof updateStateCallback === 'function') {
                    await updateStateCallback([utxo], {}, blockchain, network);
                }
            }

            return isUnspent;

        } catch (error) {
            return false;
        }
    }

    async checkUTXOStatus(utxo, network = NETWORKS.BITCOIN.TESTNET) {
        try {
            if (quickNodeService && quickNodeService.isAvailable(network)) {
                const isSpent = await quickNodeService.isUtxoSpent(utxo.txid, utxo.vout, network);
                return !isSpent;
            }

            // Fallback to mempool.space outspend endpoint
            const isMainnet = network === NETWORKS.BITCOIN.MAINNET;
            const baseUrl = isMainnet
                ? 'https://mempool.space/api'
                : 'https://mempool.space/testnet4/api';
            const url = `${baseUrl}/tx/${utxo.txid}/outspend/${utxo.vout}`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
                signal: AbortSignal.timeout(10000)
            });

            if (response.ok) {
                const outspendData = await response.json();
                return !outspendData.spent;
            } else {
                return false;
            }
        } catch (error) {
            return false;
        }
    }

    async removeSpentUTXOFromStorage(spentUtxo, blockchain, network) {
        try {
            const storedUTXOs = await getUTXOs(blockchain, network);
            const utxoIdToRemove = `${spentUtxo.txid}:${spentUtxo.vout}`;

            Object.keys(storedUTXOs).forEach(address => {
                storedUTXOs[address] = storedUTXOs[address].filter(
                    utxo => `${utxo.txid}:${utxo.vout}` !== utxoIdToRemove
                );

                if (storedUTXOs[address].length === 0) {
                    delete storedUTXOs[address];
                }
            });

            await saveUTXOs(storedUTXOs, blockchain, network);
        } catch (error) {
            // Silent fail - don't break the flow
        }
    }

    async removeUtxo(txid, vout, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        const utxo = { txid, vout };
        await this.removeSpentUTXOFromStorage(utxo, blockchain, network);

        const utxoKey = `${txid}:${vout}`;
        this.clearCacheForUtxo(utxoKey);
    }

    getCacheStats() {
        return utxoCache.getStats();
    }
}

export const utxoVerifier = new UTXOVerifier();
export default utxoVerifier;
