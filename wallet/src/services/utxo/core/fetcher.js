// UTXO Fetcher - Handles fetching UTXOs from APIs
import { getAddresses, saveUTXOs, getUTXOs } from '@/services/storage';
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';
import { quickNodeService } from '@/services/shared/quicknode-service';
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
            console.error(`Error fetching UTXOs for ${address}:`, error);
            return [];
        }
    }

    async getBitcoinAddressUTXOs(address, network) {
        try {
            // Use QuickNode service exclusively - no fallbacks
            if (!quickNodeService.isAvailable(network)) {
                throw new Error(`QuickNode not configured for network: ${network}`);
            }

            console.log(`[UTXOFetcher] Fetching UTXOs for ${address} on ${network} via QuickNode`);
            return await quickNodeService.getAddressUTXOs(address, network);
            
        } catch (error) {
            console.error(`Error fetching Bitcoin UTXOs for ${address}:`, error);
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
            console.error(`Error fetching Cardano UTXOs for ${address}:`, error);
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
                    console.log('[UTXOFetcher] Operation cancelled by user');
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

                    if (processedCount < filteredAddresses.length) {
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }

                } catch (error) {
                    console.error(`Error fetching UTXOs for address ${address}:`, error);
                    processedCount++;

                    if (onProgress) {
                        onProgress({
                            address,
                            utxos: [],
                            processed: processedCount,
                            total: filteredAddresses.length,
                            hasUtxos: false,
                            error: error.message
                        });
                    }

                    if (processedCount < filteredAddresses.length) {
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }
                }
            }

            // No need to store final UTXO map - individual addresses were already saved during progress
            console.log(`[UTXOFetcher] Incremental refresh completed for ${Object.keys(utxoMap).length} addresses`);

            // Process UTXOs for received transaction detection
            if (Object.keys(utxoMap).length > 0) {
                try {
                    console.log('[UTXOFetcher] Processing UTXOs for received transactions');
                    const transactionRecorder = new TransactionRecorder(blockchain, network);
                    await transactionRecorder.processUTXOsForReceivedTransactions(utxoMap, addressEntries);
                    console.log('[UTXOFetcher] Received transaction detection completed');
                } catch (error) {
                    console.error('[UTXOFetcher] Error processing UTXOs for received transactions:', error);
                    // Don't fail the entire UTXO fetch if transaction processing fails
                }
            }

            return utxoMap;
        } catch (error) {
            console.error('Error in sequential UTXO fetch:', error);
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
