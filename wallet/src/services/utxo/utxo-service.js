// Unified UTXO Service for centralized UTXO management across the application

import { utxoApiService } from './utxo-api';
import { utxoStorageService } from './utxo-storage';
import { selectUtxos } from './utils/selection';
import { calculateFee, calculateMixedFee, formatSats } from './utils/fee';
import { getAddresses } from '@/services/storage';
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';

export class UTXOService {
    constructor() {
        this.api = utxoApiService;
        this.storage = utxoStorageService;
    }

    // Fetch UTXOs for a single address
    async getAddressUTXOs(address, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        return await this.api.getAddressUTXOs(address, blockchain, network);
    }

    // Fetch UTXOs for multiple addresses
    async getMultipleAddressesUTXOs(addresses, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        return await this.api.getMultipleAddressesUTXOs(addresses, blockchain, network);
    }

    // Fetch and store UTXOs for all wallet addresses
    async fetchAndStoreAllUTXOs(blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        try {
            const addressEntries = await getAddresses(blockchain, network);

            // Filter addresses for the current blockchain
            const filteredAddresses = addressEntries
                .filter(entry => !entry.blockchain || entry.blockchain === blockchain)
                .map(entry => entry.address);

            if (filteredAddresses.length === 0) {
                return {};
            }

            const utxoMap = await this.getMultipleAddressesUTXOs(filteredAddresses, blockchain, network);
            await this.storage.storeUTXOs(utxoMap, blockchain, network);
            return utxoMap;
        } catch (error) {
            console.error('Error fetching UTXOs:', error);
            return {};
        }
    }

    // Retrieve UTXOs from localStorage
    async getStoredUTXOs(blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        return await this.storage.getStoredUTXOs(blockchain, network);
    }

    // Format satoshis as BTC string
    formatSats(sats) {
        return formatSats(sats);
    }

    // Calculate total balance from all UTXOs
    calculateTotalBalance(utxoMap) {
        let total = 0;

        Object.values(utxoMap).forEach(utxos => {
            utxos.forEach(utxo => {
                total += utxo.value;
            });
        });

        return total;
    }

    // Select optimal UTXOs for a transaction
    selectUtxos(utxoMap, amountBtc, feeRate = 1) {
        return selectUtxos(utxoMap, amountBtc, feeRate);
    }

    // Calculate transaction fee based on input/output count
    calculateFee(inputCount, outputCount, feeRate = 1) {
        return calculateFee(inputCount, outputCount, feeRate);
    }

    // Calculate fee for transactions with mixed input types
    calculateMixedFee(utxos, outputCount, feeRate = 1) {
        return calculateMixedFee(utxos, outputCount, feeRate);
    }

    // Update UTXO set after transaction execution
    async updateAfterTransaction(spentUtxos, newUtxos = {}, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        // Remove consumed UTXOs
        await this.storage.removeSpecificUTXOs(spentUtxos, blockchain, network);

        // Add transaction outputs as new UTXOs
        const storedUTXOs = await this.storage.getStoredUTXOs(blockchain, network);

        for (const [address, utxos] of Object.entries(newUtxos)) {
            if (!storedUTXOs[address]) {
                storedUTXOs[address] = [];
            }
            storedUTXOs[address].push(...utxos);
        }

        await this.storage.storeUTXOs(storedUTXOs, blockchain, network);

        return storedUTXOs;
    }

    // Find UTXOs by transaction ID
    async findUtxosByTxid(txid, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        const utxoMap = await this.storage.getStoredUTXOs(blockchain, network);
        const matchingUtxos = [];

        Object.entries(utxoMap).forEach(([address, utxos]) => {
            utxos.forEach(utxo => {
                if (utxo.txid === txid) {
                    matchingUtxos.push({
                        ...utxo,
                        address
                    });
                }
            });
        });

        return matchingUtxos;
    }
}

// Singleton instance export
export const utxoService = new UTXOService();

export default utxoService;
