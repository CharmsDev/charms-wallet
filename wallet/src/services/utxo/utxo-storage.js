// UTXO Storage Service for localStorage operations

import { getUTXOs, saveUTXOs } from '@/services/storage';

export class UTXOStorageService {
    // Retrieve UTXOs from localStorage
    async getStoredUTXOs() {
        return await getUTXOs();
    }

    // Save UTXOs to localStorage
    async storeUTXOs(utxoMap) {
        await saveUTXOs(utxoMap);
    }

    // Add or update UTXOs for a specific address
    async updateAddressUTXOs(address, utxos) {
        const storedUTXOs = await this.getStoredUTXOs();

        // Set UTXOs for the address
        storedUTXOs[address] = utxos;

        // Persist changes
        await this.storeUTXOs(storedUTXOs);

        return storedUTXOs;
    }

    // Remove all UTXOs for a specific address
    async removeAddressUTXOs(address) {
        const storedUTXOs = await this.getStoredUTXOs();

        // Delete address entry
        delete storedUTXOs[address];

        // Persist changes
        await this.storeUTXOs(storedUTXOs);

        return storedUTXOs;
    }

    // Remove specific UTXOs identified by txid and vout
    async removeSpecificUTXOs(utxosToRemove) {
        const storedUTXOs = await this.getStoredUTXOs();

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
        await this.storeUTXOs(storedUTXOs);

        return storedUTXOs;
    }
}

// Singleton instance export
export const utxoStorageService = new UTXOStorageService();

export default utxoStorageService;
