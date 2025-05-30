// UTXO Storage Service for localStorage operations

import { getUTXOs, saveUTXOs } from '@/services/storage';
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';

export class UTXOStorageService {
    // Retrieve UTXOs from localStorage
    async getStoredUTXOs(blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        return await getUTXOs(blockchain, network);
    }

    // Save UTXOs to localStorage
    async storeUTXOs(utxoMap, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        await saveUTXOs(utxoMap, blockchain, network);
    }

    // Add or update UTXOs for a specific address
    async updateAddressUTXOs(address, utxos, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        const storedUTXOs = await this.getStoredUTXOs(blockchain, network);

        // Set UTXOs for the address
        storedUTXOs[address] = utxos;

        // Persist changes
        await this.storeUTXOs(storedUTXOs, blockchain, network);

        return storedUTXOs;
    }

    // Remove all UTXOs for a specific address
    async removeAddressUTXOs(address, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        const storedUTXOs = await this.getStoredUTXOs(blockchain, network);

        // Delete address entry
        delete storedUTXOs[address];

        // Persist changes
        await this.storeUTXOs(storedUTXOs, blockchain, network);

        return storedUTXOs;
    }

    // Remove specific UTXOs identified by txid and vout
    async removeSpecificUTXOs(utxosToRemove, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        const storedUTXOs = await this.getStoredUTXOs(blockchain, network);

        // Create lookup set of UTXOs to remove
        const utxoIdsToRemove = new Set(
            utxosToRemove.map(utxo => `${utxo.txid}:${utxo.vout}`)
        );

        // Filter out specified UTXOs from each address
        Object.keys(storedUTXOs).forEach(address => {
            storedUTXOs[address] = storedUTXOs[address].filter(
                utxo => !utxoIdsToRemove.has(`${utxo.txid}:${utxo.vout}`)
            );

            // Clean up empty address entries
            if (storedUTXOs[address].length === 0) {
                delete storedUTXOs[address];
            }
        });

        // Persist changes
        await this.storeUTXOs(storedUTXOs, blockchain, network);

        return storedUTXOs;
    }
}

// Singleton instance export
export const utxoStorageService = new UTXOStorageService();

export default utxoStorageService;
