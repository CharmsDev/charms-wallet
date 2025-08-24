// Helper service for refreshing specific addresses after transactions
import { utxoService } from '@/services/utxo';
import { getUTXOs, saveUTXOs, getAddresses } from '@/services/storage';
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';
import { decodeTx } from '@/lib/bitcoin/txDecoder';

/**
 * Refresh UTXOs for specific addresses and update localStorage + state
 */
export async function refreshSpecificAddresses(addresses, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
    try {
        console.log(`[ADDRESS REFRESH] Refreshing ${addresses.length} addresses:`, addresses);
        
        // Get current UTXOs from storage
        const currentUTXOs = await getUTXOs(blockchain, network) || {};
        
        // Fetch fresh UTXOs for each address
        for (const address of addresses) {
            const addressUtxos = await utxoService.getAddressUTXOs(address, blockchain, network);
            
            if (addressUtxos && addressUtxos.length > 0) {
                currentUTXOs[address] = addressUtxos;
                console.log(`[ADDRESS REFRESH] Updated ${address} with ${addressUtxos.length} UTXOs`);
            } else {
                // Remove address if no UTXOs found
                delete currentUTXOs[address];
                console.log(`[ADDRESS REFRESH] Removed ${address} (no UTXOs)`);
            }
        }
        
        // Save updated UTXOs to storage
        await saveUTXOs(currentUTXOs, blockchain, network);
        
        console.log(`[ADDRESS REFRESH] Successfully refreshed ${addresses.length} addresses`);
        return currentUTXOs;
        
    } catch (error) {
        console.error('[ADDRESS REFRESH] Error refreshing addresses:', error);
        throw error;
    }
}

/**
 * Check if an address belongs to our wallet
 */
export async function isOwnAddress(address, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
    try {
        const addressEntries = await getAddresses(blockchain, network);
        const walletAddresses = addressEntries
            .filter(entry => !entry.blockchain || entry.blockchain === blockchain)
            .map(entry => entry.address);
        
        return walletAddresses.includes(address);
    } catch (error) {
        console.error('[ADDRESS REFRESH] Error checking if address is own:', error);
        return false;
    }
}

/**
 * Extract change address from transaction data
 */
export function extractChangeAddress(transactionData, destinationAddress) {
    try {
        if (!transactionData?.decodedTx?.vout) {
            return null;
        }

        // Find outputs that are not the destination address
        const changeOutputs = transactionData.decodedTx.vout.filter(output => {
            const outputAddress = output.scriptPubKey?.address;
            return outputAddress && outputAddress !== destinationAddress;
        });

        // Return the first change address found
        if (changeOutputs.length > 0) {
            return changeOutputs[0].scriptPubKey.address;
        }

        return null;
    } catch (error) {
        console.error('[ADDRESS REFRESH] Error extracting change address:', error);
        return null;
    }
}

/**
 * Refresh addresses involved in a transaction (change + destination if ours)
 */
export async function refreshTransactionAddresses(transactionData, destinationAddress, blockchain = BLOCKCHAINS.BITCOIN, network = NETWORKS.BITCOIN.TESTNET) {
    try {
        const addressesToRefresh = [];

        // Extract change address from transaction
        const changeAddress = extractChangeAddress(transactionData, destinationAddress);
        if (changeAddress) {
            console.log(`[ADDRESS REFRESH] Found change address: ${changeAddress}`);
            addressesToRefresh.push(changeAddress);
        }

        // Check if destination address belongs to our wallet
        const isDestinationOurs = await isOwnAddress(destinationAddress, blockchain, network);
        if (isDestinationOurs) {
            console.log(`[ADDRESS REFRESH] Destination address is ours: ${destinationAddress}`);
            addressesToRefresh.push(destinationAddress);
        }

        if (addressesToRefresh.length === 0) {
            console.log('[ADDRESS REFRESH] No addresses to refresh');
            return {};
        }

        // Remove duplicates
        const uniqueAddresses = [...new Set(addressesToRefresh)];
        
        // Refresh the addresses
        return await refreshSpecificAddresses(uniqueAddresses, blockchain, network);
        
    } catch (error) {
        console.error('[ADDRESS REFRESH] Error in refreshTransactionAddresses:', error);
        throw error;
    }
}
