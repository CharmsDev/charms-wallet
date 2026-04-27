// UTXO Fetcher - Handles fetching UTXOs from APIs
// Primary: Explorer API (batch). Failover: mempool.space (sequential).
import { getAddresses, saveUTXOs, getUTXOs } from '@/services/storage';
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';
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
            const { explorerWalletService } = await import('@/services/shared/explorer-wallet-service');
            if (explorerWalletService.isAvailable(network)) {
                const result = await explorerWalletService.getAddressUTXOs(address, network);
                return result?.utxos || result || [];
            }
            // Failover: mempool.space — signal that we're running degraded so
            // the operator has context when the customer reports issues.
            console.warn(`[UTXOFetcher] Explorer API disabled (circuit breaker tripped) — falling back to mempool.space for ${address}`);
            const { mempoolService } = await import('@/services/shared/mempool-service');
            const result = await mempoolService.getAddressUTXOs(address, network);
            return result?.utxos || [];
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
                vout: utxo.output_index ?? utxo.tx_index,
                value: parseInt(utxo.amount.find(a => a.unit === 'lovelace')?.quantity || '0', 10),
                assets: utxo.amount
                    .filter(a => a.unit !== 'lovelace')
                    .map(a => ({ unit: a.unit, quantity: a.quantity })),
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
    async processUTXOBatch(batchResults, currentUTXOs, utxoMap, processedCount, totalAddressCount, onProgress) {
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
                        processed: batchProcessedCount,
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

            const { getAddresses } = await import('@/services/storage');
            const addresses = await getAddresses(blockchain, network);

            if (!addresses || addresses.length === 0) {
                return {};
            }

            const addressesToScan = addressLimit
                ? addresses.slice(startOffset, startOffset + addressLimit)
                : addresses.slice(startOffset);

            const sortedEntries = addressesToScan
                .filter(entry => !entry.blockchain || entry.blockchain === blockchain)
                .sort((a, b) => a.index - b.index);
            const filteredAddresses = sortedEntries.map(entry => entry.address);

            if (filteredAddresses.length === 0) {
                return {};
            }

            const currentUTXOs = await getUTXOs(blockchain, network);
            const utxoMap = {};
            const _ts = () => new Date().toISOString().slice(11, 23);
            const syncT0 = performance.now();

            const { explorerWalletService } = await import('@/services/shared/explorer-wallet-service');
            const hasExplorer = explorerWalletService.isAvailable(network);
            console.log(`[${_ts()}] [UTXOSync] ▶ ${filteredAddresses.length} addresses, network=${network}, Explorer=${hasExplorer}`);

            if (hasExplorer) {
                // Primary: unified balance/batch — UTXOs + charm flags in one POST.
                try {
                    const data = await explorerWalletService.getBatchBalance(filteredAddresses, network);
                    let processedCount = 0;
                    for (const [addr, result] of Object.entries(data.results || {})) {
                        processedCount++;
                        if (result?.error) continue;
                        const rawUtxos = result?.btc?.utxos || [];
                        const utxos = rawUtxos.map(u => ({
                            txid: u.txid,
                            vout: u.vout,
                            value: u.value,
                            address: addr,
                            confirmations: u.confirmed ? 1 : 0,
                            blockHeight: u.blockHeight ?? null,
                            coinbase: false,
                            hasCharms: u.hasCharms === true,
                            status: {
                                confirmed: u.confirmed === true,
                                block_height: u.blockHeight ?? null,
                                block_hash: null,
                                block_time: null,
                            },
                        }));
                        if (utxos.length > 0) {
                            utxoMap[addr] = utxos;
                            currentUTXOs[addr] = utxos;
                        } else {
                            delete currentUTXOs[addr];
                        }
                        if (onProgress) {
                            onProgress({ address: addr, utxos, processed: processedCount, total: filteredAddresses.length, hasUtxos: utxos.length > 0 });
                        }
                    }
                    const ms = (performance.now() - syncT0).toFixed(0);
                    const totalUtxos = Object.values(utxoMap).reduce((s, list) => s + list.length, 0);
                    console.log(`[${_ts()}] [UTXOSync] ⚡ Batch done: ${totalUtxos} UTXOs (${ms}ms)`);
                } catch (err) {
                    // Explorer-only: surface the error rather than silently
                    // looping per-address against mempool.space.
                    console.error(`[${_ts()}] [UTXOSync] balance/batch failed: ${err.message}`);
                    throw err;
                }
            } else {
                throw new Error('Explorer API unavailable — cannot sync UTXOs');
            }

            await saveUTXOs(currentUTXOs, blockchain, network);

            const syncMs = ((performance.now() - syncT0) / 1000).toFixed(1);
            const totalUtxos = Object.values(utxoMap).reduce((s, list) => s + list.length, 0);
            console.log(`[${_ts()}] [UTXOSync] ■ Complete: ${totalUtxos} UTXOs across ${Object.keys(utxoMap).length} addresses in ${syncMs}s`);
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
