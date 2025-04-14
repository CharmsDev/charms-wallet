import { getAddresses, saveUTXOs, getUTXOs } from '@/services/storage';
import config from '@/config';
import { satoshisToBtc } from '@/services/wallet/utils/fee';

// Service for managing UTXOs (Unspent Transaction Outputs)
class UTXOService {
    // Fetch UTXOs for a single address
    async getAddressUTXOs(address) {
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

    // Fetch UTXOs for all wallet addresses and store in localStorage
    async fetchAndStoreAllUTXOs() {
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
    async getStoredUTXOs() {
        return await getUTXOs();
    }

    // Format satoshis to BTC
    formatSats(sats) {
        return satoshisToBtc(sats).toFixed(8);
    }

    // Calculate total balance from UTXOs
    calculateTotalBalance(utxoMap) {
        let total = 0;

        Object.values(utxoMap).forEach(utxos => {
            utxos.forEach(utxo => {
                total += utxo.value;
            });
        });

        return total;
    }

    // Select UTXOs for a transaction
    selectUtxos(utxoMap, amountBtc, feeRate = 1) {
        const amountSats = Math.floor(amountBtc * 100000000);
        const allUtxos = [];

        // Flatten all UTXOs
        Object.values(utxoMap).forEach(utxos => {
            allUtxos.push(...utxos);
        });

        // Sort by value (largest first to minimize number of inputs)
        allUtxos.sort((a, b) => b.value - a.value);

        // Simple coin selection - just add UTXOs until we have enough
        const selectedUtxos = [];
        let selectedAmount = 0;

        for (const utxo of allUtxos) {
            selectedUtxos.push(utxo);
            selectedAmount += utxo.value;

            // Calculate fee for current selection
            const estimatedFee = this.calculateFee(selectedUtxos.length, 2, feeRate);

            // Check if we have enough (including fee)
            if (selectedAmount >= amountSats + estimatedFee) {
                // Check if we can return change
                const change = selectedAmount - amountSats - estimatedFee;

                // If change is too small (less than 546 sats or "dust"), try to find a better selection
                if (change > 0 && change < 546) {
                    // Continue to next UTXO to see if we can find a better fit
                    continue;
                }

                // We have enough and can return proper change (or no change)
                return selectedUtxos;
            }
        }

        // If we get here and have some UTXOs but not enough, return what we found
        // The caller will check if we have enough
        return selectedAmount >= amountSats ? selectedUtxos : [];
    }

    // Calculate fee for a transaction
    calculateFee(inputCount, outputCount, feeRate = 1) {
        // For Taproot:
        // - Each input ~57 bytes (with witness data)
        // - Each output ~34 bytes
        // - 10 bytes fixed overhead
        const estimatedSize = (inputCount * 57) + (outputCount * 34) + 10;
        return Math.ceil(estimatedSize * feeRate);
    }
}

// Export a singleton instance
export const utxoService = new UTXOService();

export default utxoService;
