'use client';

import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { ECPairFactory } from 'ecpair';
import * as bip39 from 'bip39';
import { BIP32Factory } from 'bip32';
import config from '@/config';

// Initialize libraries
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
const bip32 = BIP32Factory(ecc);

// Create testnet4 network configuration with correct parameters
const testnet4Network = {
    messagePrefix: '\x18Bitcoin Signed Message:\n',
    bech32: 'tb',
    bip32: {
        public: 0x043587cf,
        private: 0x04358394,
    },
    pubKeyHash: 0x6f,
    scriptHash: 0xc4,
    wif: 0xef,
};

// Create a regtest network configuration (based on testnet4 but with different prefix)
const regtestNetwork = {
    ...testnet4Network,
    bech32: 'bcrt'
};

// Get the appropriate network based on the config
export function getNetwork() {
    return config.bitcoin.isRegtest() ? regtestNetwork : testnet4Network;
}

// Validates a Bitcoin address based on the current network
export function validateAddress(address) {
    if (config.bitcoin.isRegtest()) {
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
export async function generateTaprootAddress(seedPhrase, index, isChange = false, targetNetwork = null) {
    try {
        // Get the appropriate network - use targetNetwork if provided, otherwise current config
        const network = targetNetwork || getNetwork();

        // Convert seed phrase to seed
        const seed = await bip39.mnemonicToSeed(seedPhrase);

        // Derive the master node
        const masterNode = bip32.fromSeed(seed, network);

        // Derive the account node using BIP86 path for taproot
        // Use different coin types for different networks according to BIP44
        let derivationPath;
        // Determine derivation path based on the target network's bech32 prefix
        const isMainnetNetwork = network.bech32 === 'bc';
        if (isMainnetNetwork) {
            derivationPath = "m/86'/0'/0'"; // Mainnet: coin type 0
        } else {
            // For testnet and regtest
            derivationPath = "m/86'/1'/0'"; // Testnet/Regtest: coin type 1
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
        console.error(`Error generating address for index ${index}:`, error);
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
        // Use different coin types for different networks according to BIP44
        let derivationPath;
        if (config.bitcoin.isMainnet()) {
            derivationPath = "m/86'/0'/0'"; // Mainnet: coin type 0
        } else if (config.bitcoin.isRegtest()) {
            derivationPath = "m/86'/1'/0'"; // Regtest: coin type 1 (testnet)
        } else {
            // For testnet
            derivationPath = "m/86'/1'/0'"; // Testnet: coin type 1
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

// Generates the initial set of Bitcoin Taproot addresses in a non-blocking way
export function generateInitialBitcoinAddresses(seedPhrase, onProgress, onComplete, targetNetwork = null) {
    let i = 0;
    const addresses = [];
    const chunkSize = 10; // Process 10 indexes at a time
    const totalPairs = 256; // This will generate 512 addresses total (256 external + 256 change)

    function generateChunk() {
        const limit = Math.min(i + chunkSize, totalPairs);
        (async () => {
            for (; i < limit; i++) {
                const externalAddress = await generateTaprootAddress(seedPhrase, i, false, targetNetwork);
                addresses.push({
                    address: externalAddress,
                    index: i,
                    isChange: false,
                    created: new Date().toISOString()
                });

                const changeAddress = await generateTaprootAddress(seedPhrase, i, true, targetNetwork);
                addresses.push({
                    address: changeAddress,
                    index: i,
                    isChange: true,
                    created: new Date().toISOString()
                });

                // Report progress
                if (onProgress) {
                    onProgress(i + 1, totalPairs);
                }
            }

            if (i < totalPairs) {
                // Schedule the next chunk
                setTimeout(generateChunk, 0);
            } else {
                // All done
                if (onComplete) {
                    onComplete(addresses);
                }
            }
        })();
    }

    // Start the first chunk
    generateChunk();
}

// Optimized generator: precompute seed and HD nodes once, supports limiting pairs
export function generateInitialBitcoinAddressesFast(seedPhrase, onProgress, onComplete, targetNetwork = null, totalPairs = 256) {
    let i = 0;
    const addresses = [];
    const chunkSize = 32; // larger chunks for speed while keeping UI responsive

    (async () => {
        // Precompute seed and HD nodes once
        const network = targetNetwork || getNetwork();
        const seed = await bip39.mnemonicToSeed(seedPhrase);
        const masterNode = bip32.fromSeed(seed, network);
        const derivationPath = (network.bech32 === 'bc') ? "m/86'/0'/0'" : "m/86'/1'/0'";
        const accountNode = masterNode.derivePath(derivationPath);
        const receiveChain = accountNode.derive(0);
        const changeChain = accountNode.derive(1);

        async function generateChunk() {
            const limit = Math.min(i + chunkSize, totalPairs);
            for (; i < limit; i++) {
                // receiving (chain 0)
                const recvNode = receiveChain.derive(i);
                const recvXOnly = Buffer.from(recvNode.publicKey.slice(1, 33));
                const recvAddr = bitcoin.payments.p2tr({ internalPubkey: recvXOnly, network }).address;
                addresses.push({ address: recvAddr, index: i, isChange: false, created: new Date().toISOString() });

                // change (chain 1)
                const chgNode = changeChain.derive(i);
                const chgXOnly = Buffer.from(chgNode.publicKey.slice(1, 33));
                const chgAddr = bitcoin.payments.p2tr({ internalPubkey: chgXOnly, network }).address;
                addresses.push({ address: chgAddr, index: i, isChange: true, created: new Date().toISOString() });

                if (onProgress) onProgress(i + 1, totalPairs);
            }
            if (i < totalPairs) {
                setTimeout(generateChunk, 0);
            } else {
                if (onComplete) onComplete(addresses);
            }
        }

        generateChunk();
    })();
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
        // Use different coin types for different networks according to BIP44
        let derivationPath;
        if (config.bitcoin.isMainnet()) {
            derivationPath = "m/86'/0'/0'"; // Mainnet: coin type 0
        } else if (config.bitcoin.isRegtest()) {
            derivationPath = "m/86'/1'/0'"; // Regtest: coin type 1 (testnet)
        } else {
            // For testnet
            derivationPath = "m/86'/1'/0'"; // Testnet: coin type 1
        }
        const accountNode = masterNode.derivePath(derivationPath);

        // Get the extended public key (xpub)
        const xpub = accountNode.neutered().toBase58();

        return xpub;
    } catch (error) {
        throw error;
    }
}
