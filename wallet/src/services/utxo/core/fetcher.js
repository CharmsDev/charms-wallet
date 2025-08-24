// UTXO Fetcher - Handles fetching UTXOs from APIs
import { getAddresses, saveUTXOs, getUTXOs } from '@/services/storage';
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';
import { quickNodeService } from '@/services/bitcoin/quicknode-service';
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
            // Use mempool.space API directly (QuickNode needs BTC Blockbook addon)
            let response;
            if (config.bitcoin.isRegtest()) {
                response = await fetch(`${config.api.wallet}/bitcoin-node/utxos/${address}`);
            } else {
                response = await fetch(`${config.bitcoin.getMempoolApiUrl()}/address/${address}/utxo`);
            }

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
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
                        await new Promise(resolve => setTimeout(resolve, 500));
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
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            }

            console.log(`[UTXOFetcher] Storing final UTXO map with ${Object.keys(utxoMap).length} addresses`);
            await saveUTXOs(utxoMap, blockchain, network);

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
