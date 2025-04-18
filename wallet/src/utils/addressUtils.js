'use client';

import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { ECPairFactory } from 'ecpair';
import * as bip39 from 'bip39';
import { BIP32Factory } from 'bip32';

// Initialize libraries
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
const bip32 = BIP32Factory(ecc);

// Get the network from environment variable
const BITCOIN_NETWORK = process.env.NEXT_PUBLIC_BITCOIN_NETWORK || 'testnet';

// Create a regtest network configuration (based on testnet but with different prefix)
const regtestNetwork = {
    ...bitcoin.networks.testnet,
    bech32: 'bcrt'
};

// Get the appropriate network based on the environment variable
function getNetwork() {
    return BITCOIN_NETWORK === 'regtest' ? regtestNetwork : bitcoin.networks.testnet;
}

// Validates a Bitcoin address based on the current network
export function validateAddress(address) {
    if (BITCOIN_NETWORK === 'regtest') {
        // Check both taproot and segwit patterns for regtest
        const p2wpkhPattern = /^bcrt1q[a-z0-9]{38,39}$/;
        const p2trPattern = /^bcrt1p[a-z0-9]{58,59}$/;
        return p2trPattern.test(address) || p2wpkhPattern.test(address);
    } else {
        // Check both taproot and segwit patterns for testnet
        const p2wpkhPattern = /^tb1q[a-z0-9]{38,39}$/;
        const p2trPattern = /^tb1p[a-z0-9]{58,59}$/;
        return p2trPattern.test(address) || p2wpkhPattern.test(address);
    }
}

// Generates a new Bitcoin Taproot address using BIP86 derivation path
export async function generateTaprootAddress(seedPhrase, index, isChange = false) {
    try {
        // Get the appropriate network based on environment
        const network = getNetwork();

        // Convert seed phrase to seed
        const seed = await bip39.mnemonicToSeed(seedPhrase);

        // Derive the master node
        const masterNode = bip32.fromSeed(seed, network);

        // Derive the account node using BIP86 path for taproot
        // For regtest, Bitcoin Core might use a different derivation path
        let derivationPath;
        if (BITCOIN_NETWORK === 'mainnet') {
            derivationPath = "m/86'/0'/0'";
        } else if (BITCOIN_NETWORK === 'regtest') {
            // Try using the same derivation path as mainnet for regtest
            derivationPath = "m/86'/0'/0'";
        } else {
            // For testnet
            derivationPath = "m/86'/0'/0'";
        }
        const accountNode = masterNode.derivePath(derivationPath);

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

        return address;
    } catch (error) {
        throw error;
    }
}

// Derives the private key for a given address index and isChange flag
export async function derivePrivateKey(seedPhrase, index, isChange = false) {
    try {
        // Get the appropriate network based on environment
        const network = getNetwork();

        // Convert seed phrase to seed
        const seed = await bip39.mnemonicToSeed(seedPhrase);

        // Derive the master node
        const masterNode = bip32.fromSeed(seed, network);

        // Derive the account node using BIP86 path for taproot
        // For regtest, Bitcoin Core might use a different derivation path
        let derivationPath;
        if (BITCOIN_NETWORK === 'mainnet') {
            derivationPath = "m/86'/0'/0'";
        } else if (BITCOIN_NETWORK === 'regtest') {
            // Try using the same derivation path as mainnet for regtest
            derivationPath = "m/86'/0'/0'";
        } else {
            // For testnet
            derivationPath = "m/86'/0'/0'";
        }
        const accountNode = masterNode.derivePath(derivationPath);

        // Derive the chain node (0 for receiving addresses, 1 for change addresses)
        const chainNode = accountNode.derive(isChange ? 1 : 0);

        // Derive the address node at the specified index
        const addressNode = chainNode.derive(index);

        // Get the private key in hex format
        const privateKey = addressNode.privateKey.toString('hex');

        return privateKey;
    } catch (error) {
        throw error;
    }
}

// Imports a private key and derives the corresponding address using BIP86 for Taproot
export async function importPrivateKey(privateKey) {
    try {
        // Get the appropriate network based on environment
        const network = getNetwork();

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

        return {
            address,
            privateKey,
            index: 0, // Assume it's the first address in the BIP86 path
            isChange: false, // Assume it's a receiving address
            created: new Date().toISOString()
        };
    } catch (error) {
        throw error;
    }
}

// Copies text to clipboard
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        return false;
    }
}

/**
 * Group addresses into pairs and custom addresses
 * @param {Array} addresses - Array of address objects
 * @returns {Object} Object containing addressPairs and customAddresses
 */
export function organizeAddresses(addresses) {
    const addressPairs = {};
    const customAddresses = [];

    addresses.forEach(addr => {
        if (addr.index === -1) {
            customAddresses.push(addr);
        } else {
            if (!addressPairs[addr.index]) {
                addressPairs[addr.index] = [];
            }
            addressPairs[addr.index].push(addr);
        }
    });

    return { addressPairs, customAddresses };
}

/**
 * Derives the extended public key (xpub) for the wallet
 * @param {string} seedPhrase - The wallet's seed phrase
 * @returns {Promise<string>} The extended public key in base58 format
 */
export async function deriveXpub(seedPhrase) {
    try {
        // Get the appropriate network based on environment
        const network = getNetwork();

        // Convert seed phrase to seed
        const seed = await bip39.mnemonicToSeed(seedPhrase);

        // Derive the master node
        const masterNode = bip32.fromSeed(seed, network);

        // Derive the account node using BIP86 path for taproot
        // For regtest, Bitcoin Core might use a different derivation path
        let derivationPath;
        if (BITCOIN_NETWORK === 'mainnet') {
            derivationPath = "m/86'/0'/0'";
        } else if (BITCOIN_NETWORK === 'regtest') {
            // Try using the same derivation path as mainnet for regtest
            derivationPath = "m/86'/0'/0'";
        } else {
            // For testnet
            derivationPath = "m/86'/0'/0'";
        }
        const accountNode = masterNode.derivePath(derivationPath);

        // Get the extended public key (xpub)
        const xpub = accountNode.neutered().toBase58();

        return xpub;
    } catch (error) {
        throw error;
    }
}
