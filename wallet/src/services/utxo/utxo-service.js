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
            return {};
        }
    }

    async fetchAndStoreAllUTXOsSequential(blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET, onProgress = null, addressLimit = null, startOffset = 0) {
        return await this.fetcher.fetchAndStoreAllUTXOsSequential(blockchain, network, onProgress, addressLimit, startOffset);
    }

    // ============================================================================
    // STORAGE OPERATIONS
    // ============================================================================

    async getStoredUTXOsRaw(blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        return await getUTXOs(blockchain, network);
    }

    async saveCleanedUTXOs(cleanedUtxos, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        await saveUTXOs(cleanedUtxos, blockchain, network);
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

        // Deduplicate per address by txid:vout before saving
        const deduped = {};
        Object.entries(storedUTXOs).forEach(([addr, list]) => {
            const seen = new Set();
            deduped[addr] = (list || []).filter(u => {
                const key = `${u.txid}:${u.vout}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        });

        await saveUTXOs(deduped, blockchain, network);
        return deduped;
    }

    // ============================================================================
    // SELECTION OPERATIONS
    // ============================================================================

    selectUtxos(utxoMap, amountBtc, feeRate) {
        return this.selector.selectUtxos(utxoMap, amountBtc, feeRate);
    }

    selectUtxosGreedy(utxoMap, amountBtc, feeRate) {
        return this.selector.selectUtxosGreedy(utxoMap, amountBtc, feeRate);
    }

    async selectUtxosForAmountDynamic(availableUtxos, amountInSats, feeRate, updateStateCallback = null, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
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

    selectUtxosForAmount(availableUtxos, amountInSats, feeRate) {
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

    async removeUtxo(txid, vout, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        return await this.verifier.removeUtxo(txid, vout, blockchain, network);
    }

    // ============================================================================
    // CALCULATION OPERATIONS
    // ============================================================================

    calculateFee(inputCount, outputCount, feeRate) {
        return this.calculations.calculateFee(inputCount, outputCount, feeRate);
    }

    calculateMixedFee(utxos, outputCount, feeRate) {
        return this.calculations.calculateMixedFee(utxos, outputCount, feeRate);
    }

    calculateTotalBalance(utxoMap) {
        return this.calculations.calculateTotalBalance(utxoMap);
    }

    // Single-pass computation for spendable and pending
    calculateBalances(utxoMap, charms = []) {
        return this.calculations.calculateBalances(utxoMap, charms);
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
        const utxoMap = await this.getStoredUTXOsRaw(blockchain, network);
        return this.calculations.findUtxosByTxid(utxoMap, txid);
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
            // Prepare spent UTXOs for removal
            const spentUtxos = transactionData.utxos.map(utxo => ({
                txid: utxo.txid,
                vout: utxo.vout,
                address: utxo.address
            }));

            // Create potential new UTXOs from transaction outputs
            const newUtxos = await this.createNewUtxosFromTransaction(transactionData, blockchain, network);

            // Update UTXO store
            await updateAfterTransaction(spentUtxos, newUtxos, blockchain, network);

            return {
                success: true,
                spentUtxos: spentUtxos.length,
                newUtxos: Object.values(newUtxos).reduce((total, utxos) => total + utxos.length, 0)
            };

        } catch (error) {
            throw error;
        }
    }

    async createNewUtxosFromTransaction(transactionData, blockchain, network) {
        const newUtxos = {};

        try {
            // Get wallet addresses to identify change outputs
            const addresses = await getAddresses();
            const walletAddresses = new Set(addresses.map(addr => addr.address));

            // If we have transaction data with decoded outputs, process them
            if (transactionData.decodedTx && transactionData.decodedTx.outputs) {
                for (let vout = 0; vout < transactionData.decodedTx.outputs.length; vout++) {
                    const output = transactionData.decodedTx.outputs[vout];

                    // Skip OP_RETURN outputs (value = 0)
                    if (output.value === 0) {
                        continue;
                    }

                    // Check if this output goes to one of our addresses
                    if (output.address && walletAddresses.has(output.address)) {

                        if (!newUtxos[output.address]) {
                            newUtxos[output.address] = [];
                        }

                        // Create new UTXO entry (unconfirmed)
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
            }
            // No fallback: if we don't have decodedTx outputs, the next
            // chain sync rebuilds the UTXO set authoritatively. Guessing
            // the change with a magic fee constant produced wrong values.

        } catch (error) {
            // Return empty object - we'll get the real UTXOs on next refresh
        }

        return newUtxos;
    }

    scheduleDelayedRefresh(refreshFunction, delay = 3000) {
        setTimeout(() => {
            refreshFunction();
        }, delay);
    }

    getTransactionSummary(transactionData) {
        const inputCount = transactionData.utxos ? transactionData.utxos.length : 0;
        const totalInput = transactionData.utxos ?
            transactionData.utxos.reduce((sum, utxo) => sum + utxo.value, 0) : 0;

        return {
            txid: transactionData.txid,
            inputCount,
            totalInput,
            amountSent: transactionData.amount,
            size: transactionData.size
        };
    }

}

// Singleton instance export
export const utxoService = new UTXOService();
export default utxoService;
