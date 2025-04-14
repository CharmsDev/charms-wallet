// UTXO API Service for fetching UTXOs from wallet API (regtest) or mempool.space (testnet)

import config from '@/config';

export class UTXOApiService {
    // Fetch UTXOs for a single address
    async getAddressUTXOs(address) {
        try {
            let response;

            // Environment logging
            console.log('Environment check:');
            console.log('- Bitcoin network:', config.bitcoin.network);
            console.log('- Is regtest mode:', config.bitcoin.isRegtest());
            console.log('- Wallet API base:', config.api.wallet);

            // Select API based on network type
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
