'use client';

// Import directly from the real wallet-sdk library
import * as sdk from '@/lib/wallet-sdk/src';
import { AddressType } from '@/lib/wallet-sdk/src/types';
import { NetworkType, toPsbtNetwork } from '@/lib/wallet-sdk/src/network';
import { LocalWallet } from '@/lib/wallet-sdk/src/wallet/local-wallet';
import { bitcoin, ECPair } from '@/lib/wallet-sdk/src/bitcoin-core';
import * as bip39 from 'bip39';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';

// Initialize BIP32 with the ECC library
const bip32 = BIP32Factory(ecc);

/**
 * Utility function to help debug transaction hex
 * @param {string} txHex - The transaction hex to debug
 */
function debugTxHex(txHex) {
    if (!txHex || typeof txHex !== 'string') {
        console.log('Invalid txHex:', txHex);
        return;
    }

    console.log('Transaction hex length:', txHex.length);
    console.log('First 20 chars:', txHex.substring(0, 20));
    console.log('Last 20 chars:', txHex.substring(txHex.length - 20));

    // Check for common issues
    if (txHex.includes(' ')) {
        console.log('WARNING: Transaction hex contains spaces');
    }
    if (txHex.includes('\n') || txHex.includes('\r')) {
        console.log('WARNING: Transaction hex contains newlines');
    }
    if (!/^[0-9a-fA-F]*$/.test(txHex)) {
        console.log('WARNING: Transaction hex contains non-hex characters');
        // Find the first non-hex character
        const match = txHex.match(/[^0-9a-fA-F]/);
        if (match) {
            console.log('First non-hex character:', match[0], 'at position:', txHex.indexOf(match[0]));
        }
    }
}

/**
 * Sign Bitcoin commit transaction (Taproot)
 * 
 * @param {string} unsignedTxHex - The unsigned transaction hex
 * @param {string} seedPhrase - The seed phrase to derive the key pair from
 * @param {number} utxoAmount - The amount of the UTXO being spent in satoshis
 * @param {string} utxoInternalKey - The internal key of the P2TR UTXO being spent
 * @param {Object} network - The Bitcoin network (testnet or mainnet)
 * @param {string} derivationPath - The derivation path for the wallet
 * @param {Function} logCallback - Optional callback for logging messages
 * @returns {Object} The signed transaction details
 */
export async function signCommitTransaction(
    unsignedTxHex,
    seedPhrase,
    utxoAmount,
    utxoInternalKey,
    network = bitcoin.networks.testnet,
    derivationPath = "m/86'/0'/0'/0/0",
    logCallback = () => { }
) {
    try {
        // Clean the transaction hex (remove any spaces or newlines)
        if (unsignedTxHex && typeof unsignedTxHex === 'string') {
            const cleanTxHex = unsignedTxHex.replace(/[\s\n\r]/g, '');
            if (cleanTxHex !== unsignedTxHex) {
                logCallback('Transaction hex was cleaned');
                unsignedTxHex = cleanTxHex;
            }
        }

        // Parse the unsigned transaction
        const txDetails = parseUnsignedTx(unsignedTxHex);
        logCallback('Transaction parsed successfully');

        // Generate the wallet from the seed phrase
        const seed = await bip39.mnemonicToSeed(seedPhrase);
        const masterNode = bip32.fromSeed(seed, network);
        const accountNode = masterNode.derivePath("m/86'/0'/0'");
        const addressNode = accountNode.derive(0).derive(0);
        const wif = addressNode.toWIF();

        // Determine the network type based on the network object
        const networkType = network === bitcoin.networks.testnet ?
            NetworkType.TESTNET :
            (network === bitcoin.networks.regtest ? NetworkType.REGTEST : NetworkType.MAINNET);

        // Create a wallet instance using the real SDK's LocalWallet class
        const wallet = new LocalWallet(wif, AddressType.P2TR, networkType);

        logCallback(`Wallet generated with address: ${wallet.address}`);

        // Create a new PSBT (Partially Signed Bitcoin Transaction)
        const psbt = new bitcoin.Psbt({ network });

        // Add the input using data from the unsigned transaction
        // Ensure all buffers are properly created
        const utxoScript = Buffer.from(`5120${utxoInternalKey}`, 'hex');
        const tapInternalKey = Buffer.from(utxoInternalKey, 'hex');

        psbt.addInput({
            hash: txDetails.utxoTxId,
            index: txDetails.utxoVout,
            sequence: txDetails.utxoSequence,
            witnessUtxo: {
                script: utxoScript,
                value: utxoAmount
            },
            tapInternalKey: tapInternalKey
        });

        // Add the output using data from the unsigned transaction
        psbt.addOutput({
            script: txDetails.outputScript,
            value: txDetails.outputAmount
        });

        logCallback(`PSBT created with input TXID: ${txDetails.utxoTxId}, vout: ${txDetails.utxoVout}`);
        logCallback(`Fee: ${utxoAmount - txDetails.outputAmount} satoshis`);

        // Sign the PSBT using the wallet's signPsbt method
        const signedPsbt = await wallet.signPsbt(psbt, {
            autoFinalized: true,
            toSignInputs: [
                {
                    index: 0,
                    publicKey: wallet.pubkey
                }
            ]
        });

        logCallback('Transaction signed successfully');

        // Extract the transaction - no more mock data
        const tx = signedPsbt.extractTransaction();
        const signedTxHex = tx.toHex();
        const txid = tx.getId();
        logCallback('Transaction extracted successfully');

        return {
            txid,
            hex: signedTxHex,
            address: wallet.address
        };
    } catch (error) {
        console.error('Error in transaction signing:', error);
        logCallback(`Error: ${error.message}`);
        throw error;
    }
}

/**
 * Parse unsigned transaction
 * @param {string} txHex - The unsigned transaction hex
 * @returns {Object} The extracted transaction details
 */
export function parseUnsignedTx(txHex) {
    try {
        // Debug the transaction hex
        console.log('Debugging transaction hex:');
        debugTxHex(txHex);

        // Validate the transaction hex
        if (!txHex || typeof txHex !== 'string') {
            throw new Error('Transaction hex must be a non-empty string');
        }

        // Check if it's a valid hex string
        if (!/^[0-9a-fA-F]*$/.test(txHex)) {
            throw new Error('Transaction hex contains invalid characters');
        }

        // Check if the length is reasonable (at least 10 bytes for a minimal tx)
        if (txHex.length < 20) {
            throw new Error('Transaction hex is too short');
        }

        // Clean the transaction hex (remove any spaces or newlines)
        const cleanTxHex = txHex.replace(/[\s\n\r]/g, '');
        if (cleanTxHex !== txHex) {
            console.log('Transaction hex was cleaned, original length:', txHex.length, 'cleaned length:', cleanTxHex.length);
            txHex = cleanTxHex;
        }

        // Convert hex to Buffer first to ensure proper handling
        console.log('Converting hex to buffer, hex length:', txHex.length);
        const txBuffer = Buffer.from(txHex, 'hex');
        console.log('Buffer created, length:', txBuffer.length);

        // Try using both methods to parse the transaction
        let tx;
        try {
            console.log('Attempting to parse with fromBuffer');
            tx = bitcoin.Transaction.fromBuffer(txBuffer);
        } catch (bufferError) {
            console.error('Error parsing with fromBuffer:', bufferError);
            console.log('Attempting to parse with fromHex');
            tx = bitcoin.Transaction.fromHex(txHex);
        }

        console.log('Transaction parsed successfully');

        // Parse inputs
        const inputs = tx.ins.map((input, index) => {
            const txid = Buffer.from(input.hash).reverse().toString('hex');
            const vout = input.index;
            const sequence = input.sequence;
            return {
                index,
                txid,
                vout,
                sequence
            };
        });

        // Parse outputs
        const outputs = tx.outs.map((output, index) => {
            try {
                const value = output.value;
                const script = output.script;
                console.log(`Output #${index} script length: ${script.length}`);
                const scriptDecoded = decodeScript(script);
                return {
                    index,
                    value,
                    script: script.toString('hex'),
                    scriptDecoded
                };
            } catch (outputError) {
                console.error(`Error parsing output #${index}:`, outputError);
                return {
                    index,
                    value: output.value || 0,
                    script: (output.script || Buffer.from([])).toString('hex'),
                    scriptDecoded: { type: 'Error' }
                };
            }
        });

        // We assume the transaction has at least one input and one output
        if (inputs.length === 0 || outputs.length === 0) {
            throw new Error('Transaction must have at least one input and one output');
        }

        return {
            version: tx.version,
            locktime: tx.locktime,
            utxoTxId: inputs[0].txid,
            utxoVout: inputs[0].vout,
            utxoSequence: inputs[0].sequence,
            outputAmount: outputs[0].value,
            outputScript: tx.outs[0].script,
            outputScriptHex: outputs[0].script.toString('hex'),
            outputInternalKey: outputs[0].scriptDecoded.type === 'P2TR' ? outputs[0].scriptDecoded.internalKey : null
        };
    } catch (error) {
        console.error('Error parsing transaction:', error);
        throw new Error(`Failed to parse transaction: ${error.message}`);
    }
}

/**
 * Helper function to decode a Bitcoin script
 * @param {Buffer} script - The script buffer to decode
 * @returns {Object} The decoded script information
 */
function decodeScript(script) {
    try {
        // Check if it's a P2TR script (OP_1 <32-byte-pubkey>)
        if (script.length === 34 && script[0] === 0x51 && script[1] === 0x20) {
            const internalKey = script.slice(2).toString('hex');
            return {
                type: 'P2TR',
                internalKey
            };
        }

        // Add more script type detection as needed

        return {
            type: 'Unknown'
        };
    } catch (error) {
        console.error('Error decoding script:', error);
        return {
            type: 'Error'
        };
    }
}
