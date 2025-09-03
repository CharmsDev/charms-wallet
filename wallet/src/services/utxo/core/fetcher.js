// UTXO Fetcher - Handles fetching UTXOs from APIs
import { getAddresses, saveUTXOs, getUTXOs } from '@/services/storage';
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';
import { bitcoinApiRouter } from '@/services/shared/bitcoin-api-router';
import TransactionRecorder from '@/services/transactions/transaction-recorder';
import config from '@/config';

export class UTXOFetcher {
    constructor() {
        this.cancelRequested = false;
    }

    async getAddressUTXOs(address, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        try {
            if (blockchain === BLOCKCHAINS.BITCOIN) {
                return await this.getBitcoinAddressUTXOs(address, network);
            } else if (blockchain === BLOCKCHAINS.CARDANO) {
                return await this.getCardanoAddressUTXOs(address, network);
            }
            return [];
        } catch (error) {
            return [];
        }
    }

    async getBitcoinAddressUTXOs(address, network) {
        try {
            // Use Bitcoin API Router (mempool.space fallback)
            const utxos = await bitcoinApiRouter.getAddressUTXOs(address, network);
            return utxos;
        } catch (error) {
            console.error(`[UTXOFetcher] Error getting UTXOs for ${address}:`, error);
            return [];
        }
    }

    async getCardanoAddressUTXOs(address, network) {
        try {
            const response = await fetch(`${config.cardano.getBlockfrostApiUrl()}/addresses/${address}/utxos`, {
                headers: {
                    'project_id': config.cardano.blockfrostProjectId
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.map(utxo => ({
                txid: utxo.tx_hash,
                vout: utxo.output_index,
                value: parseInt(utxo.amount[0].quantity, 10),
                status: {
                    confirmed: true
                }
            }));
        } catch (error) {
            return [];
        }
    }

    async getMultipleAddressesUTXOs(addresses, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        const utxoMap = {};

        await Promise.all(
            addresses.map(async (address) => {
                const utxos = await this.getAddressUTXOs(address, blockchain, network);
                if (utxos.length > 0) {
                    utxoMap[address] = utxos;
                }
            })
        );

        return utxoMap;
    }

    async fetchAndStoreAllUTXOsSequential(blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET, onProgress = null) {
        try {
            this.resetCancelFlag();

            // Early check for Bitcoin networks - if QuickNode not available, skip entirely
            if (blockchain === BLOCKCHAINS.BITCOIN) {
                const { bitcoinApiRouter } = await import('@/services/shared/bitcoin-api-router');
                if (!bitcoinApiRouter.isAvailable(network)) {
                    return {};
                }
            }

            const addressEntries = await getAddresses(blockchain, network);
            const filteredAddresses = addressEntries
                .filter(entry => !entry.blockchain || entry.blockchain === blockchain)
                .map(entry => entry.address);

            if (filteredAddresses.length === 0) {
                return {};
            }

            const utxoMap = {};
            let processedCount = 0;

            for (const address of filteredAddresses) {
                if (this.cancelRequested) {
                    return utxoMap;
                }

                try {
                    const utxos = await this.getAddressUTXOs(address, blockchain, network);

                    if (utxos && utxos.length > 0) {
                        utxoMap[address] = utxos;
                        // Update individual address UTXOs immediately
                        const currentUTXOs = await getUTXOs(blockchain, network);
                        currentUTXOs[address] = utxos;
                        await saveUTXOs(currentUTXOs, blockchain, network);

                        if (onProgress) {
                            onProgress({
                                address,
                                utxos,
                                processed: processedCount + 1,
                                total: filteredAddresses.length,
                                hasUtxos: true
                            });
                        }
                    } else {
                        // Remove address from localStorage if no UTXOs found
                        const currentUTXOs = await getUTXOs(blockchain, network);
                        delete currentUTXOs[address];
                        await saveUTXOs(currentUTXOs, blockchain, network);

                        if (onProgress) {
                            onProgress({
                                address,
                                utxos: [],
                                processed: processedCount + 1,
                                total: filteredAddresses.length,
                                hasUtxos: false
                            });
                        }
                    }

                    processedCount++;

                } catch (error) {
                    // Log the error but continue with other addresses
                    console.warn(`Failed to fetch UTXOs for ${address}:`, error.message);
                    
                    processedCount++;
                    if (onProgress) {
                        onProgress({
                            address,
                            utxos: [],
                            processed: processedCount,
                            total: filteredAddresses.length,
                            hasUtxos: false,
                            error: `Failed to fetch UTXOs for ${address}: ${error.message}`
                        });
                    }
                }

                if (processedCount < filteredAddresses.length) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }

            // No need to store final UTXO map - individual addresses were already saved during progress

            // Process UTXOs for received transaction detection
            if (Object.keys(utxoMap).length > 0) {
                try {
                    const transactionRecorder = new TransactionRecorder(blockchain, network);
                    await transactionRecorder.processUTXOsForReceivedTransactions(utxoMap, addressEntries);
                } catch (error) {
                    // Don't fail the entire UTXO fetch if transaction processing fails
                }
            }

            return utxoMap;
        } catch (error) {
            return {};
        }
    }

    cancelOperations() {
        this.cancelRequested = true;
    }

    resetCancelFlag() {
        this.cancelRequested = false;
    }
}

export const utxoFetcher = new UTXOFetcher();
export default utxoFetcher;
