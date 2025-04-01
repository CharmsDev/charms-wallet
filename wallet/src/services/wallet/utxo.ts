import { UTXO, UTXOMap } from '@/types';
import { getAddresses, saveUTXOs, getUTXOs } from '@/services/storage';
import config from '@/config';

class UTXOService {

    // Fetch UTXOs for a single address
    async getAddressUTXOs(address: string): Promise<UTXO[]> {
        try {
            let response;

            // Debug logging
            console.log('Environment check:');
            console.log('- Bitcoin network:', config.bitcoin.network);
            console.log('- Is regtest mode:', config.bitcoin.isRegtest());
            console.log('- Wallet API base:', config.api.wallet);

            // Use the wallet API for regtest mode, mempool.space for testnet
            if (config.bitcoin.isRegtest()) {
                const apiUrl = `${config.api.wallet}/bitcoin-node/utxos/${address}`;
                console.log(`Using wallet API for regtest: ${apiUrl}`);
                response = await fetch(apiUrl);
            } else {
                const mempoolApiUrl = config.bitcoin.getMempoolApiUrl();
                console.log(`Using mempool API for testnet: ${mempoolApiUrl}/address/${address}/utxo`);
                response = await fetch(`${mempoolApiUrl}/address/${address}/utxo`);
            }

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
