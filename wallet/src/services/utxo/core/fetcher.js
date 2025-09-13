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
            // Use Bitcoin API Router (uses blockchain context for network)
            const utxos = await bitcoinApiRouter.getUTXOs(address, network);
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

    /**
     * Process UTXO batch results in a non-blocking way
     * Uses setTimeout to yield control back to the event loop
     */
    async processUTXOBatch(batchResults, currentUTXOs, utxoMap, processedCount, startOffset, totalAddressCount, onProgress) {
        return new Promise((resolve) => {
            let batchProcessedCount = processedCount;
            let currentIndex = 0;

            const processBatchItem = () => {
                if (currentIndex >= batchResults.length) {
                    resolve(batchProcessedCount);
                    return;
                }

                const result = batchResults[currentIndex];
                batchProcessedCount++;
                
                if (result.success && result.utxos && result.utxos.length > 0) {
                    utxoMap[result.address] = result.utxos;
                    currentUTXOs[result.address] = result.utxos;
                } else {
                    // Remove address if no UTXOs found
                    delete currentUTXOs[result.address];
                }

                if (onProgress) {
                    onProgress({
                        address: result.address,
                        utxos: result.utxos || [],
                        processed: batchProcessedCount + startOffset,
                        total: totalAddressCount,
                        hasUtxos: result.success && result.utxos && result.utxos.length > 0,
                        error: result.error || null
                    });
                }

                currentIndex++;
                // Use setTimeout to yield control and prevent UI blocking
                setTimeout(processBatchItem, 0);
            };

            // Start processing
            processBatchItem();
        });
    }

    async fetchAndStoreAllUTXOsSequential(blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET, onProgress = null, addressLimit = null, startOffset = 0) {
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
            const allAddresses = addressEntries
                .filter(entry => !entry.blockchain || entry.blockchain === blockchain)
                .map(entry => entry.address);
            
            const totalAddressCount = allAddresses.length;
            let filteredAddresses = allAddresses;

            // Apply address limit and offset if specified
            if (startOffset > 0) {
                filteredAddresses = filteredAddresses.slice(startOffset);
            }
            if (addressLimit && addressLimit > 0) {
                filteredAddresses = filteredAddresses.slice(0, addressLimit);
            }

            if (filteredAddresses.length === 0) {
                return {};
            }

            // Load current UTXOs once at the beginning for optimized storage
            const currentUTXOs = await getUTXOs(blockchain, network);
            const utxoMap = {};
            let processedCount = 0;
            const batchSize = 4; // Process 4 addresses in parallel (even numbers)

            // Process addresses in parallel batches
            for (let i = 0; i < filteredAddresses.length; i += batchSize) {
                if (this.cancelRequested) {
                    break;
                }

                const batch = filteredAddresses.slice(i, i + batchSize);
                const batchPromises = batch.map(async (address) => {
                    try {
                        const utxos = await this.getAddressUTXOs(address, blockchain, network);
                        return { address, utxos, success: true };
                    } catch (error) {
                        console.warn(`Failed to fetch UTXOs for ${address}:`, error.message);
                        return { address, utxos: [], success: false, error: error.message };
                    }
                });

                const batchResults = await Promise.all(batchPromises);

                // Process batch results using non-blocking method
                processedCount = await this.processUTXOBatch(
                    batchResults, 
                    currentUTXOs, 
                    utxoMap, 
                    processedCount, 
                    startOffset, 
                    totalAddressCount, 
                    onProgress
                );

                // Save storage once per batch instead of per address (non-blocking)
                setTimeout(async () => {
                    await saveUTXOs(currentUTXOs, blockchain, network);
                }, 0);

                // Add delay only for mempool.space and only between batches
                if (i + batchSize < filteredAddresses.length) {
                    const { quickNodeService } = await import('@/services/shared/quicknode-service');
                    
                    // Only delay if using mempool.space fallback (not QuickNode)
                    if (!quickNodeService.isAvailable(network)) {
                        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay for mempool.space
                    }
                }
            }

            // Final storage save (non-blocking)
            setTimeout(async () => {
                await saveUTXOs(currentUTXOs, blockchain, network);
            }, 0);

            // Process UTXOs for received transaction detection (non-blocking)
            if (Object.keys(utxoMap).length > 0) {
                setTimeout(async () => {
                    try {
                        const transactionRecorder = new TransactionRecorder(blockchain, network);
                        await transactionRecorder.processUTXOsForReceivedTransactions(utxoMap, addressEntries);
                    } catch (error) {
                        // Don't fail the entire UTXO fetch if transaction processing fails
                        console.warn('Transaction processing failed:', error.message);
                    }
                }, 100); // Small delay to ensure UTXO processing completes first
            }

            return utxoMap;
        } catch (error) {
            console.error('UTXO fetching failed:', error.message);
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
