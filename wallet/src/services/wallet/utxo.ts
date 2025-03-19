import { UTXO, UTXOMap } from '@/types';
import { getAddresses, saveUTXOs, getUTXOs } from '@/services/storage';

class UTXOService {
    private readonly API_BASE = 'https://mempool.space/testnet4/api';

    // Fetch UTXOs for a single address
    async getAddressUTXOs(address: string): Promise<UTXO[]> {
        try {
            const response = await fetch(`${this.API_BASE}/address/${address}/utxo`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`Failed to fetch UTXOs for address ${address}:`, error);
            return [];
        }
    }

    // Fetch UTXOs for multiple addresses
    async getMultipleAddressesUTXOs(addresses: string[]): Promise<UTXOMap> {
        const utxoMap: UTXOMap = {};

        await Promise.all(
            addresses.map(async (address) => {
                const utxos = await this.getAddressUTXOs(address);
                if (utxos.length > 0) {
                    utxoMap[address] = utxos;
                }
            })
        );

        return utxoMap;
    }

    // Fetch UTXOs for all wallet addresses and store in localStorage
    async fetchAndStoreAllUTXOs(): Promise<UTXOMap> {
        try {
            const addressEntries = await getAddresses();
            const addresses = addressEntries.map(entry => entry.address);
            const utxoMap = await this.getMultipleAddressesUTXOs(addresses);
            await saveUTXOs(utxoMap);
            return utxoMap;
        } catch (error) {
            console.error('Failed to fetch and store UTXOs:', error);
            return {};
        }
    }

    // Get UTXOs from localStorage
    async getStoredUTXOs(): Promise<UTXOMap> {
        return await getUTXOs();
    }

    // Format satoshis to BTC
    formatSats(sats: number): string {
        return (sats / 100_000_000).toFixed(8);
    }

    // Calculate total balance from UTXOs
    calculateTotalBalance(utxoMap: UTXOMap): number {
        let total = 0;

        Object.values(utxoMap).forEach(utxos => {
            utxos.forEach(utxo => {
                total += utxo.value;
            });
        });

        return total;
    }
}

export const utxoService = new UTXOService();
