// UTXO API Service for fetching UTXOs from wallet API (regtest) or mempool.space (testnet)

import config from '@/config';
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';

export class UTXOApiService {
    // Fetch UTXOs for a single address
    async getAddressUTXOs(address, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        try {
            if (blockchain === BLOCKCHAINS.BITCOIN) {
                return await this.getBitcoinAddressUTXOs(address, network);
            } else if (blockchain === BLOCKCHAINS.CARDANO) {
                return await this.getCardanoAddressUTXOs(address, network);
            }
            return [];
        } catch (error) {
            console.error(`Error fetching UTXOs for ${address}:`, error);
            return [];
        }
    }

    // Fetch Bitcoin UTXOs for a single address
    async getBitcoinAddressUTXOs(address, network) {
        try {
            let response;

            // Select API based on network type
            if (config.bitcoin.isRegtest()) {
                response = await fetch(`${config.api.wallet}/bitcoin-node/utxos/${address}`);
            } else {
                // Use mempool.space API based on network
                response = await fetch(`${config.bitcoin.getMempoolApiUrl()}/address/${address}/utxo`);
            }

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`Error fetching Bitcoin UTXOs for ${address}:`, error);
            return [];
        }
    }

    // Fetch Cardano UTXOs for a single address
    async getCardanoAddressUTXOs(address, network) {
        try {
            // Use Blockfrost API to get UTXOs
            const response = await fetch(`${config.cardano.getBlockfrostApiUrl()}/addresses/${address}/utxos`, {
                headers: {
                    'project_id': config.cardano.blockfrostProjectId
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            // Transform Blockfrost response to match our UTXO format
            return data.map(utxo => ({
                txid: utxo.tx_hash,
                vout: utxo.output_index,
                value: parseInt(utxo.amount[0].quantity, 10), // Convert lovelace to number
                status: {
                    confirmed: true
                }
            }));
        } catch (error) {
            console.error(`Error fetching Cardano UTXOs for ${address}:`, error);
            // For development/testing, return mock data if API fails
            return [];
        }
    }

    // Fetch UTXOs for multiple addresses
    async getMultipleAddressesUTXOs(addresses, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
        const utxoMap = {};

        await Promise.all(
            addresses.map(async (address) => {
                const utxos = await this.getAddressUTXOs(address, blockchain, network);
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
