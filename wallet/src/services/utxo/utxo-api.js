// UTXO API Service for fetching UTXOs from wallet API (regtest) or mempool.space (testnet)

import config from '@/config';

export class UTXOApiService {
    // Fetch UTXOs for a single address
    async getAddressUTXOs(address) {
        try {
            let response;

            // Select API based on network type
            if (config.bitcoin.isRegtest()) {
                const apiUrl = `${config.api.wallet}/bitcoin-node/utxos/${address}`;
                response = await fetch(apiUrl);
            } else {
                const mempoolApiUrl = config.bitcoin.getMempoolApiUrl();
                response = await fetch(`${mempoolApiUrl}/address/${address}/utxo`);
            }

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            return [];
        }
    }

    // Fetch UTXOs for multiple addresses
    async getMultipleAddressesUTXOs(addresses) {
        const utxoMap = {};

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
}

// Singleton instance export
export const utxoApiService = new UTXOApiService();

export default utxoApiService;
