import * as bitcoin from 'bitcoinjs-lib';
import * as bip39 from 'bip39';
import * as ecc from 'tiny-secp256k1';
import { BIP32Factory } from 'bip32';
import { ECPairFactory } from 'ecpair';
import { getAddresses, getSeedPhrase } from '@/services/storage';
import { utxoService } from '@/services/utxo';
import { findAddressForUTXO } from '@/services/repository/txUtils';
import { getDerivationPath } from '@/services/repository/txUtils';
import { toXOnly } from '@/services/repository/txUtils';
import { createUnsignedTransaction } from './transaction';

// Determine input type based on scriptPubKey format
function determineInputType(scriptPubKey, address) {
    // Identify script type from prefix
    if (scriptPubKey.startsWith('5120')) {
        return 'p2tr'; // Taproot
    } else if (scriptPubKey.startsWith('76a914')) {
        return 'p2pkh'; // P2PKH
    } else if (address.startsWith('tb1p') || address.startsWith('bcrt1p')) {
        return 'p2tr'; // Taproot address format
    } else {
        return 'p2tr'; // Default to Taproot
    }
}

// Library initialization
const bip32 = BIP32Factory(ecc);
const ECPair = ECPairFactory(ecc);

// Sign Bitcoin transaction with appropriate signature algorithm
export async function signTransaction(input, logCallback) {
    // Configure logging function
    const log = message => logCallback ? logCallback(message) : console.log(message);

    try {
        // Check input format (object or hex string)
        const isTransactionData = typeof input === 'object' && input !== null;

        let unsignedTxHex;
        let transactionData;

        if (isTransactionData) {
            // Process transaction data object
            transactionData = input;
            log('Transaction data:', JSON.stringify(transactionData, null, 2));

            // Validate UTXO inputs
            if (!transactionData.utxos || !Array.isArray(transactionData.utxos) || transactionData.utxos.length === 0) {
                throw new Error('No UTXOs provided for transaction');
            }

            // Generate unsigned transaction
            unsignedTxHex = await createUnsignedTransaction(transactionData);
            log('Created unsigned transaction:', unsignedTxHex.substring(0, 50) + '...');
        } else {
            // Use provided hex string
            unsignedTxHex = input;
        }

        // Parse transaction from hex
        const tx = bitcoin.Transaction.fromHex(unsignedTxHex);

        // Set version 2 for Taproot compatibility
        tx.version = 2;

        // Retrieve seed phrase from storage
        const seedPhrase = await getSeedPhrase();
        if (!seedPhrase) {
            throw new Error('Seed phrase not found in storage');
        }

        // Generate seed from mnemonic
        const seed = await bip39.mnemonicToSeed(seedPhrase);

        // Select network based on address format
        let network;
        // Check for regtest addresses
        const addresses = await getAddresses();
        const hasRegtestAddress = addresses.some(addr => addr.address.startsWith('bcrt'));

        if (hasRegtestAddress) {
            log('Using regtest network for signing (found regtest address)');
            network = bitcoin.networks.regtest;
        } else {
            log('Using testnet network for signing');
            network = bitcoin.networks.testnet;
        }

        const root = bip32.fromSeed(seed, network);

        // Sign each transaction input
        for (let inputIndex = 0; inputIndex < tx.ins.length; inputIndex++) {
            const input = tx.ins[inputIndex];
            const inputTxid = Buffer.from(input.hash).reverse().toString('hex');
            const inputVout = input.index;

            // Identify address for input UTXO
            const addressInfo = await findAddressForUTXO(inputTxid, inputVout);
            if (!addressInfo) {
                log('Available UTXOs:', await utxoService.getStoredUTXOs());
                throw new Error(`Could not find address for UTXO: ${inputTxid}:${inputVout}`);
            }

            // Determine derivation path
            const path = getDerivationPath(addressInfo);
            log(`Using path ${path} for input ${inputIndex}`);

            // Generate private key
            const child = root.derivePath(path);
            if (!child.privateKey) {
                throw new Error(`Could not derive private key for path: ${path}`);
            }

            // Retrieve UTXO details
            let utxoValue = null;
            let scriptPubKey = null;

            if (isTransactionData) {
                // Extract UTXO from transaction data
                const utxo = transactionData.utxos.find(u => u.txid === inputTxid && u.vout === inputVout);
                if (utxo) {
                    utxoValue = utxo.value;
                    scriptPubKey = utxo.scriptPubKey;
                }
            }

            // Fall back to storage for UTXO details
            if (utxoValue === null) {
                const matchingUtxos = await utxoService.findUtxosByTxid(inputTxid);
                const matchingUtxo = matchingUtxos.find(utxo => utxo.vout === inputVout);

                if (matchingUtxo) {
                    utxoValue = matchingUtxo.value;
                    scriptPubKey = matchingUtxo.scriptPubKey;
                }
            }

            if (utxoValue === null) {
                throw new Error(`UTXO value not found: ${inputTxid}:${inputVout}`);
            }

            // Identify input script type
            let inputType = 'p2tr'; // Default to p2tr
            if (scriptPubKey) {
                inputType = determineInputType(scriptPubKey, addressInfo.address);
                log(`Input type: ${inputType}`);
            }

            // Apply appropriate signing algorithm
            if (inputType === 'p2tr') {
                // Taproot signing with Schnorr
                const internalPubkey = toXOnly(child.publicKey);

                // Initialize P2TR payment object
                const p2tr = bitcoin.payments.p2tr({
                    internalPubkey,
                    network: network
                });

                // Generate signature hash
                const sighash = tx.hashForWitnessV1(
                    inputIndex,
                    [p2tr.output],
                    [utxoValue],
                    bitcoin.Transaction.SIGHASH_DEFAULT
                );

                // Apply Taproot tweak
                const tweak = bitcoin.crypto.taggedHash('TapTweak', internalPubkey);

                // Handle key parity
                const isOddY = child.publicKey[0] === 0x03;
                const tweakedPrivateKey = ecc.privateAdd(
                    isOddY ? ecc.privateNegate(child.privateKey) : child.privateKey,
                    tweak
                );

                if (!tweakedPrivateKey) {
                    throw new Error('Tweak resulted in invalid private key');
                }

                // Create Schnorr signature
                const signatureBytes = ecc.signSchnorr(sighash, tweakedPrivateKey);
                // Ensure buffer format
                const signature = Buffer.isBuffer(signatureBytes)
                    ? signatureBytes
                    : Buffer.from(signatureBytes);

                // Attach witness data
                tx.ins[inputIndex].witness = [signature];

                log(`Signed input ${inputIndex} as Taproot`);
            } else if (inputType === 'p2pkh') {
                // P2PKH signing with ECDSA
                const keyPair = ECPair.fromPrivateKey(child.privateKey);

                // Set signature hash type
                const hashType = bitcoin.Transaction.SIGHASH_ALL;

                // Convert script to buffer
                const scriptPubKeyBuffer = Buffer.from(scriptPubKey, 'hex');

                // Generate legacy signature hash
                const signatureHash = tx.hashForSignature(
                    inputIndex,
                    scriptPubKeyBuffer,
                    hashType
                );

                // Create ECDSA signature
                const signatureBytes = keyPair.sign(signatureHash);
                // Ensure buffer format
                const signatureBuffer = Buffer.isBuffer(signatureBytes)
                    ? signatureBytes
                    : Buffer.from(signatureBytes);

                const signature = bitcoin.script.signature.encode(
                    signatureBuffer,
                    hashType
                );

                // Compile input script
                const scriptSig = bitcoin.script.compile([
                    signature,
                    child.publicKey
                ]);

                // Attach script to input
                tx.ins[inputIndex].script = scriptSig;

                log(`Signed input ${inputIndex} as P2PKH`);
            } else {
                throw new Error(`Unsupported input type: ${inputType}`);
            }
        }

        // Finalize transaction
        const txHex = tx.toHex();
        const txid = tx.getId();

        log(`Transaction signed. Size: ${txHex.length / 2} bytes, TXID: ${txid}`);

        // Output transaction for testing
        log(`\n\nFull transaction hex for testing:\n`);
        log(`bitcoin-cli testmempoolaccept '["${txHex}"]'`);
        log(`\n`);

        // Return appropriate response format
        if (isTransactionData) {
            return txHex;
        } else {
            return {
                txid,
                signedTxHex: txHex
            };
        }
    } catch (error) {
        log(`Error signing transaction: ${error.message}`);
        throw error;
    }
}

export default {
    signTransaction
};
