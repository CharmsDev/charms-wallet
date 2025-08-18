// Main UTXO Service - Orchestrates all UTXO operations
import { utxoFetcher } from './core/fetcher';
import { utxoSelector } from './core/selector';
import { utxoVerifier } from './core/verifier';
import { utxoCalculations } from './utils/calculations';
import { getUTXOs, saveUTXOs, getAddresses } from '@/services/storage';
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';

export class UTXOService {
    constructor() {
        this.fetcher = utxoFetcher;
        this.selector = utxoSelector;
        this.verifier = utxoVerifier;
        this.calculations = utxoCalculations;
    }

    // ============================================================================
    // FETCHING OPERATIONS
    // ============================================================================

    async getAddressUTXOs(address, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        return await this.fetcher.getAddressUTXOs(address, blockchain, network);
    }

    async getMultipleAddressesUTXOs(addresses, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        return await this.fetcher.getMultipleAddressesUTXOs(addresses, blockchain, network);
    }

    async fetchAndStoreAllUTXOs(blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        try {
            const addressEntries = await getAddresses(blockchain, network);
            const filteredAddresses = addressEntries
                .filter(entry => !entry.blockchain || entry.blockchain === blockchain)
                .map(entry => entry.address);

            if (filteredAddresses.length === 0) {
                return {};
            }

            const utxoMap = await this.fetcher.getMultipleAddressesUTXOs(filteredAddresses, blockchain, network);
            await saveUTXOs(utxoMap, blockchain, network);
            return utxoMap;
        } catch (error) {
            console.error('Error fetching UTXOs:', error);
            return {};
        }
    }

    async fetchAndStoreAllUTXOsSequential(blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET, onProgress = null) {
        return await this.fetcher.fetchAndStoreAllUTXOsSequential(blockchain, network, onProgress);
    }

    // ============================================================================
    // STORAGE OPERATIONS
    // ============================================================================

    async getStoredUTXOs(blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        const utxos = await getUTXOs(blockchain, network);
        // Filter out pending UTXOs
        return this.filterPendingUTXOs(utxos);
    }

    async getStoredUTXOsRaw(blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        // Get UTXOs without filtering pending ones
        return await getUTXOs(blockchain, network);
    }

    async updateAfterTransaction(spentUtxos, newUtxos = {}, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        // Remove spent UTXOs
        const storedUTXOs = await getUTXOs(blockchain, network);
        const utxoIdsToRemove = new Set(
            spentUtxos.map(utxo => `${utxo.txid}:${utxo.vout}`)
        );

        Object.keys(storedUTXOs).forEach(address => {
            storedUTXOs[address] = storedUTXOs[address].filter(
                utxo => !utxoIdsToRemove.has(`${utxo.txid}:${utxo.vout}`)
            );

            if (storedUTXOs[address].length === 0) {
                delete storedUTXOs[address];
            }
        });

        // Add new UTXOs
        for (const [address, utxos] of Object.entries(newUtxos)) {
            if (!storedUTXOs[address]) {
                storedUTXOs[address] = [];
            }
            storedUTXOs[address].push(...utxos);
        }

        await saveUTXOs(storedUTXOs, blockchain, network);
        return storedUTXOs;
    }

    // ============================================================================
    // SELECTION OPERATIONS
    // ============================================================================

    selectUtxos(utxoMap, amountBtc, feeRate = 1) {
        return this.selector.selectUtxos(utxoMap, amountBtc, feeRate);
    }

    selectUtxosGreedy(utxoMap, amountBtc, feeRate = 1) {
        return this.selector.selectUtxosGreedy(utxoMap, amountBtc, feeRate);
    }

    async selectUtxosForAmountDynamic(availableUtxos, amountInSats, feeRate = 1, updateStateCallback = null, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        return await this.selector.selectUtxosForAmountDynamic(
            availableUtxos,
            amountInSats,
            feeRate,
            this.verifier,
            updateStateCallback,
            blockchain,
            network
        );
    }

    selectUtxosForAmount(availableUtxos, amountInSats, feeRate = 1) {
        return this.selector.selectUtxosForAmount(availableUtxos, amountInSats, feeRate);
    }

    // ============================================================================
    // VERIFICATION OPERATIONS
    // ============================================================================

    async verifyAndUpdateUTXO(utxo, updateStateCallback = null, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        return await this.verifier.verifyAndUpdateUTXO(utxo, updateStateCallback, blockchain, network);
    }

    clearVerificationCache() {
        this.verifier.clearCache();
    }

    // ============================================================================
    // CALCULATION OPERATIONS
    // ============================================================================

    calculateFee(inputCount, outputCount, feeRate = 1) {
        return this.calculations.calculateFee(inputCount, outputCount, feeRate);
    }

    calculateMixedFee(utxos, outputCount, feeRate = 1) {
        return this.calculations.calculateMixedFee(utxos, outputCount, feeRate);
    }

    calculateTotalBalance(utxoMap) {
        return this.calculations.calculateTotalBalance(utxoMap);
    }

    formatSats(satoshis) {
        return this.calculations.formatSats(satoshis);
    }

    satoshisToBtc(satoshis) {
        return this.calculations.satoshisToBtc(satoshis);
    }

    btcToSatoshis(btc) {
        return this.calculations.btcToSatoshis(btc);
    }

    async findUtxosByTxid(txid, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        const utxoMap = await this.getStoredUTXOs(blockchain, network);
        return this.calculations.findUtxosByTxid(utxoMap, txid);
    }

    // ============================================================================
    // UTXO LOCKING (for transaction building)
    // ============================================================================

    lockUtxos(utxos) {
        this.selector.lockUtxos(utxos);
    }

    unlockUtxos(utxos) {
        this.selector.unlockUtxos(utxos);
    }

    clearAllLocks() {
        this.selector.clearAllLocks();
    }

    isUtxoLocked(txid, vout) {
        return this.selector.isUtxoLocked(txid, vout);
    }

    getLockStats() {
        return this.selector.getLockStats();
    }

    // ============================================================================
    // OPERATION CONTROL
    // ============================================================================

    cancelOperations() {
        this.fetcher.cancelOperations();
    }

    resetCancelFlag() {
        this.fetcher.resetCancelFlag();
    }

    // ============================================================================
    // TRANSACTION MANAGER COMPATIBILITY
    // ============================================================================

    async processTransactionCompletion(transactionData, updateAfterTransaction, blockchain, network) {
        try {
            console.log('[UTXOService] Processing transaction completion:', transactionData.txid);

            const spentUtxos = transactionData.utxos.map(utxo => ({
                txid: utxo.txid,
                vout: utxo.vout,
                address: utxo.address
            }));

            console.log('[UTXOService] Removing spent UTXOs:', spentUtxos);

            const newUtxos = await this.createNewUtxosFromTransaction(transactionData, blockchain, network);

            await updateAfterTransaction(spentUtxos, newUtxos, blockchain, network);

            console.log('[UTXOService] UTXO state updated successfully');

            return {
                success: true,
                spentUtxos: spentUtxos.length,
                newUtxos: Object.values(newUtxos).reduce((total, utxos) => total + utxos.length, 0)
            };

        } catch (error) {
            console.error('[UTXOService] Error processing transaction completion:', error);
            throw error;
        }
    }

    async createNewUtxosFromTransaction(transactionData, blockchain, network) {
        const newUtxos = {};

        try {
            const addresses = await getAddresses();
            const walletAddresses = new Set(addresses.map(addr => addr.address));

            if (transactionData.decodedTx && transactionData.decodedTx.outputs) {
                for (let vout = 0; vout < transactionData.decodedTx.outputs.length; vout++) {
                    const output = transactionData.decodedTx.outputs[vout];

                    if (output.value === 0) {
                        continue;
                    }

                    if (output.address && walletAddresses.has(output.address)) {
                        console.log('[UTXOService] Found change output:', {
                            address: output.address,
                            value: output.value,
                            vout
                        });

                        if (!newUtxos[output.address]) {
                            newUtxos[output.address] = [];
                        }

                        newUtxos[output.address].push({
                            txid: transactionData.txid,
                            vout: vout,
                            value: output.value,
                            status: {
                                confirmed: false,
                                block_height: null,
                                block_hash: null,
                                block_time: null
                            }
                        });
                    }
                }
            } else {
                const totalInput = transactionData.utxos.reduce((sum, utxo) => sum + utxo.value, 0);
                const amountSent = Math.floor(transactionData.amount * 100000000);
                const estimatedFee = transactionData.size ? transactionData.size * 5 : 1000;
                const changeAmount = totalInput - amountSent - estimatedFee;

                if (changeAmount > 546) {
                    const changeAddress = addresses.find(addr => addr.isChange)?.address || addresses[0]?.address;

                    if (changeAddress) {
                        console.log('[UTXOService] Estimated change output:', {
                            address: changeAddress,
                            value: changeAmount,
                            vout: 1
                        });

                        newUtxos[changeAddress] = [{
                            txid: transactionData.txid,
                            vout: 1,
                            value: changeAmount,
                            status: {
                                confirmed: false,
                                block_height: null,
                                block_hash: null,
                                block_time: null
                            }
                        }];
                    }
                }
            }

        } catch (error) {
            console.warn('[UTXOService] Could not create new UTXOs from transaction:', error);
        }

        return newUtxos;
    }

    // ============================================================================
    // PENDING UTXOs MANAGEMENT
    // ============================================================================

    getPendingUTXOsKey(blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        return `pending_utxos_${blockchain}_${network}`;
    }

    async markUTXOsAsPending(utxos, txid, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        try {
            const key = this.getPendingUTXOsKey(blockchain, network);
            const existing = JSON.parse(localStorage.getItem(key) || '{}');
            
            const timestamp = Date.now();
            for (const utxo of utxos) {
                const utxoKey = `${utxo.txid}:${utxo.vout}`;
                existing[utxoKey] = {
                    txid: utxo.txid,
                    vout: utxo.vout,
                    value: utxo.value,
                    address: utxo.address,
                    pendingTxid: txid,
                    timestamp
                };
            }
            
            localStorage.setItem(key, JSON.stringify(existing));
            console.log(`[UTXOService] Marked ${utxos.length} UTXOs as pending for tx ${txid}`);
        } catch (error) {
            console.error('[UTXOService] Failed to mark UTXOs as pending:', error);
        }
    }

    async clearPendingUTXOs(txid, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        try {
            const key = this.getPendingUTXOsKey(blockchain, network);
            const existing = JSON.parse(localStorage.getItem(key) || '{}');
            
            let cleared = 0;
            for (const [utxoKey, pendingUtxo] of Object.entries(existing)) {
                if (pendingUtxo.pendingTxid === txid) {
                    delete existing[utxoKey];
                    cleared++;
                }
            }
            
            localStorage.setItem(key, JSON.stringify(existing));
            console.log(`[UTXOService] Cleared ${cleared} pending UTXOs for tx ${txid}`);
        } catch (error) {
            console.error('[UTXOService] Failed to clear pending UTXOs:', error);
        }
    }

    filterPendingUTXOs(utxoMap, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        try {
            const key = this.getPendingUTXOsKey(blockchain, network);
            const pendingUtxos = JSON.parse(localStorage.getItem(key) || '{}');
            
            if (Object.keys(pendingUtxos).length === 0) {
                return utxoMap;
            }
            
            const filtered = {};
            for (const [address, utxos] of Object.entries(utxoMap)) {
                filtered[address] = utxos.filter(utxo => {
                    const utxoKey = `${utxo.txid}:${utxo.vout}`;
                    const isPending = pendingUtxos[utxoKey];
                    if (isPending) {
                        console.log(`[UTXOService] Filtering out pending UTXO: ${utxoKey}`);
                        return false;
                    }
                    return true;
                });
            }
            
            return filtered;
        } catch (error) {
            console.error('[UTXOService] Failed to filter pending UTXOs:', error);
            return utxoMap;
        }
    }

    async cleanupOldPendingUTXOs(maxAgeHours = 24, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        try {
            const key = this.getPendingUTXOsKey(blockchain, network);
            const existing = JSON.parse(localStorage.getItem(key) || '{}');
            
            const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds
            const now = Date.now();
            let cleaned = 0;
            
            for (const [utxoKey, pendingUtxo] of Object.entries(existing)) {
                if (now - pendingUtxo.timestamp > maxAge) {
                    delete existing[utxoKey];
                    cleaned++;
                }
            }
            
            if (cleaned > 0) {
                localStorage.setItem(key, JSON.stringify(existing));
                console.log(`[UTXOService] Cleaned up ${cleaned} old pending UTXOs`);
            }
        } catch (error) {
            console.error('[UTXOService] Failed to cleanup old pending UTXOs:', error);
        }
    }
}

// Singleton instance export
export const utxoService = new UTXOService();
export default utxoService;
