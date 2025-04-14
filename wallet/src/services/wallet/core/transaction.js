import * as bitcoin from 'bitcoinjs-lib';
import { getAddresses } from '@/services/storage';
import { utxoService } from '@/services/utxo';

// Generate unsigned Bitcoin transaction from input data
export async function createUnsignedTransaction(transactionData) {
    try {
        // Select network based on address format
        let network;
        if (transactionData.destinationAddress.startsWith('bcrt')) {
            console.log('Using regtest network for transaction');
            network = bitcoin.networks.regtest;
        } else {
            console.log('Using testnet network for transaction');
            network = bitcoin.networks.testnet;
        }

        // Initialize transaction object
        const tx = new bitcoin.Transaction();
        tx.version = 2;

        // Add transaction inputs from UTXOs
        for (const utxo of transactionData.utxos) {
            const txidBuffer = Buffer.from(utxo.txid, 'hex').reverse();
            tx.addInput(txidBuffer, utxo.vout);
        }

        // Create payment output
        const amountInSatoshis = Math.floor(transactionData.amount * 100000000);
        const outputScript = bitcoin.address.toOutputScript(
            transactionData.destinationAddress,
            network
        );
        tx.addOutput(outputScript, amountInSatoshis);

        // Calculate total input value
        const totalInputValue = transactionData.utxos.reduce((sum, utxo) => sum + utxo.value, 0);

        // Set fee rate with minimum relay fee consideration
        const feeRate = transactionData.feeRate || 5;
        console.log(`Using fee rate: ${feeRate} sat/byte`);

        // Calculate fee based on input script types
        const estimatedFee = utxoService.calculateMixedFee(transactionData.utxos, 2, feeRate);
        console.log(`Estimated fee: ${estimatedFee} satoshis`);

        const changeAmount = totalInputValue - amountInSatoshis - estimatedFee;

        // Handle remaining funds as change
        if (changeAmount > 0) {
            // Determine change destination
            let changeAddress = transactionData.changeAddress;
            if (!changeAddress) {
                const addresses = await getAddresses();
                changeAddress = addresses.find(addr => addr.isChange)?.address || addresses[0].address;
            }

            // Select network for change output
            let changeNetwork;
            if (changeAddress.startsWith('bcrt')) {
                console.log(`Using regtest network for change address: ${changeAddress}`);
                changeNetwork = bitcoin.networks.regtest;
            } else {
                console.log(`Using testnet network for change address: ${changeAddress}`);
                changeNetwork = bitcoin.networks.testnet;
            }
            const changeScript = bitcoin.address.toOutputScript(changeAddress, changeNetwork);
            tx.addOutput(changeScript, changeAmount);
        }

        return tx.toHex();
    } catch (error) {
        console.error('Error creating unsigned transaction:', error);
        throw error;
    }
}

export default {
    createUnsignedTransaction
};
