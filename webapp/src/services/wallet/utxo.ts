import type { UTXO } from '../../types';

class UTXOService {
    private readonly API_BASE = 'https://mempool.space/testnet4/api';

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

    async getMultipleAddressesUTXOs(addresses: string[]): Promise<{ [address: string]: UTXO[] }> {
        const utxoMap: { [address: string]: UTXO[] } = {};

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

    formatSats(sats: number): string {
        return (sats / 100_000_000).toFixed(8);
    }
}

export const utxoService = new UTXOService();
