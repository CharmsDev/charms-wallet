// Unified UTXO Service for centralized UTXO management across the application

import { utxoApiService } from './utxo-api';
import { utxoStorageService } from './utxo-storage';
import { selectUtxos } from './utils/selection';
import { calculateFee, calculateMixedFee, formatSats } from './utils/fee';
import { getAddresses } from '@/services/storage';

export class UTXOService {
    constructor() {
        this.api = utxoApiService;
        this.storage = utxoStorageService;
    }

    // Fetch UTXOs for a single address
    async getAddressUTXOs(address) {
        return await this.api.getAddressUTXOs(address);
    }

    // Fetch UTXOs for multiple addresses
    async getMultipleAddressesUTXOs(addresses) {
        return await this.api.getMultipleAddressesUTXOs(addresses);
    }

    // Fetch and store UTXOs for all wallet addresses
    async fetchAndStoreAllUTXOs() {
        try {
            const addressEntries = await getAddresses();
            const addresses = addressEntries.map(entry => entry.address);
            const utxoMap = await this.getMultipleAddressesUTXOs(addresses);
            await this.storage.storeUTXOs(utxoMap);
            return utxoMap;
        } catch (error) {
            return {};
        }
    }

    // Retrieve UTXOs from localStorage
    async getStoredUTXOs() {
        return await this.storage.getStoredUTXOs();
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
    async updateAfterTransaction(spentUtxos, newUtxos = {}) {
        // Remove consumed UTXOs
        await this.storage.removeSpecificUTXOs(spentUtxos);

        // Add transaction outputs as new UTXOs
        const storedUTXOs = await this.storage.getStoredUTXOs();

        for (const [address, utxos] of Object.entries(newUtxos)) {
            if (!storedUTXOs[address]) {
                storedUTXOs[address] = [];
            }
            storedUTXOs[address].push(...utxos);
        }

        await this.storage.storeUTXOs(storedUTXOs);

        return storedUTXOs;
    }

    // Find UTXOs by transaction ID
    async findUtxosByTxid(txid) {
        const utxoMap = await this.storage.getStoredUTXOs();
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
