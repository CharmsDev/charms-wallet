import config from '@/config';
import { getAddresses } from '@/services/storage';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';

// Initialize the ECC library for bitcoinjs-lib
bitcoin.initEccLib(ecc);

/**
 * Service for transferring Bitcoin through the Charms API
 */

/**
 * Creates a Bitcoin transaction in hex format
 * @param {Object} transactionData - The transaction data
 * @param {Array} transactionData.utxos - Array of UTXOs to use as inputs
 * @param {string} transactionData.destinationAddress - Recipient Bitcoin address
 * @param {number} transactionData.amount - Amount to send in BTC
 * @param {number} transactionData.feeRate - Fee rate in satoshis per byte (optional)
 * @param {string} transactionData.changeAddress - Change address (optional)
 * @returns {Promise<string>} - The transaction in hex format
 */
export const createBitcoinTransactionHex = async (transactionData) => {
    try {
        // Get the transaction object
        const txObject = await composeBitcoinTransaction(transactionData);

        // Determine the network
        const network = config.bitcoin.isRegtest()
            ? bitcoin.networks.regtest
            : bitcoin.networks.testnet;

        // Create a new transaction
        const tx = new bitcoin.Transaction();

        // Set version
        tx.version = 2;

        // Add inputs
        for (const input of txObject.inputs) {
            // Convert txid to Buffer (reversed)
            const txidBuffer = Buffer.from(input.txid, 'hex').reverse();

            tx.addInput(txidBuffer, input.vout);
        }

        // Add outputs
        for (const output of txObject.outputs) {
            // Create output script from address
            const outputScript = bitcoin.address.toOutputScript(output.address, network);

            tx.addOutput(outputScript, output.value);
        }

        // Convert to hex
        const txHex = tx.toHex();

        console.log('Created transaction hex:', txHex);

        return txHex;
    } catch (error) {
        console.error('Error creating Bitcoin transaction hex:', error);
        throw error;
    }
};

/**
 * Composes a Bitcoin transaction object from the provided transaction data
 * @param {Object} transactionData - The transaction data
 * @param {Array} transactionData.utxos - Array of UTXOs to use as inputs
 * @param {string} transactionData.destinationAddress - Recipient Bitcoin address
 * @param {number} transactionData.amount - Amount to send in BTC
 * @param {number} transactionData.feeRate - Fee rate in satoshis per byte (optional)
 * @param {string} transactionData.changeAddress - Change address (optional)
 * @returns {Promise<Object>} - The formatted Bitcoin transaction object
 */
export const composeBitcoinTransaction = async (transactionData) => {
    // Calculate total input value in satoshis
    const totalInputValue = transactionData.utxos.reduce((sum, utxo) => sum + utxo.value, 0);

    // Convert amount to satoshis
    const amountInSatoshis = Math.floor(transactionData.amount * 100000000);

    // Estimate fee (simplified for now)
    const estimatedFee = 500; // 500 satoshis as a placeholder

    // Calculate change amount
    const changeAmount = totalInputValue - amountInSatoshis - estimatedFee;

    // Get change address from localStorage if not provided
    let changeAddress = transactionData.changeAddress;
    if (!changeAddress) {
        try {
            // Try to get a change address from localStorage
            const addresses = await getAddresses();
            const changeAddressEntry = addresses.find(addr => addr.isChange) || addresses[0];
            changeAddress = changeAddressEntry?.address;

            if (!changeAddress && addresses.length > 0) {
                // If no change address is found, use the first address
                changeAddress = addresses[0].address;
            }
        } catch (error) {
            console.error('Error getting change address from storage:', error);
            // If we can't get a change address, use the destination address as fallback
            changeAddress = transactionData.destinationAddress;
        }
    }

    console.log(`Using change address: ${changeAddress}`);

    // Prepare outputs
    const outputs = [
        {
            address: transactionData.destinationAddress,
            value: amountInSatoshis
        }
    ];

    // Add change output if there's change to return
    if (changeAmount > 0) {
        outputs.push({
            address: changeAddress,
            value: changeAmount
        });
    }

    // Format the data for the API
    return {
        inputs: transactionData.utxos.map(utxo => ({
            txid: utxo.txid,
            vout: utxo.vout,
            value: utxo.value,
            scriptPubKey: utxo.scriptPubKey
        })),
        outputs,
        network: config.bitcoin.network,
        feeRate: transactionData.feeRate || 1, // Default fee rate if not provided
        changeAddress // Include the change address for reference
    };
};

/**
 * Sends a Bitcoin transaction to the Charms API
 * @param {Object} transactionData - The transaction data
 * @param {Array} transactionData.utxos - Array of UTXOs to use as inputs
 * @param {string} transactionData.destinationAddress - Recipient Bitcoin address
 * @param {number} transactionData.amount - Amount to send in BTC
 * @param {number} transactionData.feeRate - Fee rate in satoshis per byte (optional)
 * @param {string} transactionData.changeAddress - Change address (optional)
 * @returns {Promise<Object>} - The API response with transaction details
 */
export const transferBitcoin = async (transactionData) => {
    try {
        // Compose the Bitcoin transaction object
        const apiData = await composeBitcoinTransaction(transactionData);

        // Determine which API to use based on network
        const apiUrl = `${config.api.wallet}/transaction/send`;
        console.log(`Sending transaction to: ${apiUrl}`);

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(apiData),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error transferring Bitcoin:', error);
        throw error;
    }
};

/**
 * Gets the status of a Bitcoin transaction
 * @param {string} txid - The transaction ID
 * @returns {Promise<Object>} - The transaction status
 */
export const getTransactionStatus = async (txid) => {
    try {
        const apiUrl = `${config.api.wallet}/transaction/status/${txid}`;
        console.log(`Getting transaction status from: ${apiUrl}`);

        const response = await fetch(apiUrl);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error getting transaction status:', error);
        throw error;
    }
};

/**
 * Estimates the fee for a Bitcoin transaction
 * @param {Object} transactionData - Basic transaction data
 * @param {number} transactionData.inputCount - Number of inputs
 * @param {number} transactionData.outputCount - Number of outputs
 * @param {number} transactionData.feeRate - Fee rate in satoshis per byte
 * @returns {Promise<Object>} - The estimated fee
 */
export const estimateTransactionFee = async (transactionData) => {
    try {
        const apiUrl = `${config.api.wallet}/transaction/estimate-fee`;
        console.log(`Estimating transaction fee from: ${apiUrl}`);

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(transactionData),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error estimating transaction fee:', error);
        throw error;
    }
};

export default {
    transferBitcoin,
    getTransactionStatus,
    estimateTransactionFee,
    composeBitcoinTransaction,
    createBitcoinTransactionHex
};
