'use client';

import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { ECPairFactory } from 'ecpair';

// Initialize bitcoinjs-lib with the ECC library
bitcoin.initEccLib(ecc);

// Initialize ECPair with the tiny-secp256k1 library
const ECPair = ECPairFactory(ecc);

// Validates a Bitcoin testnet address
export function validateAddress(address) {
    // Since we're using only taproot, we could just check for taproot pattern
    // But keeping segwit pattern for backward compatibility
    const p2wpkhPattern = /^tb1q[a-z0-9]{38,39}$/;
    const p2trPattern = /^tb1p[a-z0-9]{58,59}$/;

    // Prioritize taproot addresses but still accept segwit for compatibility
    return p2trPattern.test(address) || p2wpkhPattern.test(address);
}

import * as bip39 from 'bip39';
import { BIP32Factory } from 'bip32';

// Initialize BIP32
const bip32 = BIP32Factory(ecc);

// Generates a new Bitcoin testnet Taproot address using BIP86 derivation path
export async function generateTaprootAddress(seedPhrase, index, isChange = false) {
    try {
        // Use testnet network
        const network = bitcoin.networks.testnet;

        // Convert seed phrase to seed
        const seed = await bip39.mnemonicToSeed(seedPhrase);

        // Derive the master node
        const masterNode = bip32.fromSeed(seed, network);

        // Derive the account node using BIP86 path for taproot: m/86'/0'/0'
        const accountNode = masterNode.derivePath("m/86'/0'/0'");

        // Derive the chain node (0 for receiving addresses, 1 for change addresses)
        const chainNode = accountNode.derive(isChange ? 1 : 0);

        // Derive the address node at the specified index
        const addressNode = chainNode.derive(index);

        // Get the public key and convert to x-only format for Taproot
        const pubkey = addressNode.publicKey;
        // Convert to Buffer explicitly to avoid Uint8Array type error
        const xOnlyPubkey = Buffer.from(pubkey.slice(1, 33)); // Remove the first byte (type prefix)

        // Create a P2TR address using the same parameters as Bitcoin Core
        const { address } = bitcoin.payments.p2tr({
            internalPubkey: xOnlyPubkey,
            network,
            // Use the default taproot tree which is what Bitcoin Core uses
            // This ensures compatibility with the tr() descriptor in Bitcoin Core
        });

        // Log the address for debugging
        console.log(`Generated Taproot address at index ${index} (isChange: ${isChange}): ${address}`);

        return address;
    } catch (error) {
        console.error("Error generating Taproot address:", error);
        throw error;
    }
}

// Imports a private key and derives the corresponding address using BIP86 for Taproot
export async function importPrivateKey(privateKey) {
    try {
        // Use testnet network
        const network = bitcoin.networks.testnet;

        // Validate private key format (should be 64 hex characters)
        if (!/^[0-9a-fA-F]{64}$/.test(privateKey)) {
            throw new Error("Invalid private key format. Expected 64 hex characters.");
        }

        // Convert hex string to Buffer
        const privateKeyBuffer = Buffer.from(privateKey, 'hex');

        // Create a key pair from the private key
        const keyPair = ECPair.fromPrivateKey(privateKeyBuffer, { network });

        // Get the public key and convert to x-only format for Taproot
        const pubkey = keyPair.publicKey;
        const xOnlyPubkey = Buffer.from(pubkey.slice(1, 33)); // Convert to Buffer and remove the first byte

        // Create a P2TR address using the same parameters as Bitcoin Core
        const { address } = bitcoin.payments.p2tr({
            internalPubkey: xOnlyPubkey,
            network,
            // Use the default taproot tree which is what Bitcoin Core uses
            // This ensures compatibility with the tr() descriptor in Bitcoin Core
        });

        // Log the address for debugging
        console.log(`Generated Taproot address from imported private key: ${address}`);

        return {
            address,
            privateKey,
            index: 0, // Assume it's the first address in the BIP86 path
            created: new Date().toISOString()
        };
    } catch (error) {
        console.error("Error importing private key:", error);
        throw error;
    }
}

// Copies text to clipboard
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        console.error("Failed to copy text: ", err);
        return false;
    }
}
