'use client';

import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import * as bip39 from 'bip39';
import { BIP32Factory } from 'bip32';
import config from '@/config';

// Initialize libraries
bitcoin.initEccLib(ecc);
const bip32 = BIP32Factory(ecc);

export async function deriveXpubFromSeedPhrase(seedPhrase, path = "m/86'/0'/0'") {
    try {
        // Convert seed phrase to seed
        const seed = await bip39.mnemonicToSeed(seedPhrase);

        // Derive the master node using testnet network
        const masterNode = bip32.fromSeed(seed, bitcoin.networks.testnet);

        // Get master key fingerprint (hex)
        const fingerprintBuffer = bitcoin.crypto.hash160(masterNode.publicKey).slice(0, 4);
        const masterFingerprint = Buffer.from(fingerprintBuffer).toString('hex');

        // Derive the account node
        const accountNode = masterNode.derivePath(path);

        // Get the xpub (for testnet, this will be a tpub)
        const xpub = accountNode.neutered().toBase58();

        // Get the xpriv (for testnet, this will be a tprv)
        const xpriv = accountNode.toBase58();

        const result = {
            xpub,
            xpriv,
            masterFingerprint,
            path
        };

        return result;
    } catch (error) {
        console.error('Error deriving xpub from seed phrase:', error);
        throw error;
    }
}

export function createTaprootDescriptor(xpub, masterFingerprint, path = "m/86'/0'/0'") {
    // For taproot descriptors, we use tr() with the xpub
    // The format is: tr([fingerprint/path]xpub/0/*)
    // This creates a descriptor for external addresses (receiving)

    const externalDescriptor = `tr([${masterFingerprint}${path}]${xpub}/0/*)`;
    const changeDescriptor = `tr([${masterFingerprint}${path}]${xpub}/1/*)`;

    return {
        external: externalDescriptor,
        change: changeDescriptor
    };
}

export async function generateDescriptorsFromSeedPhrase(seedPhrase) {
    try {
        const { xpub, masterFingerprint, path } = await deriveXpubFromSeedPhrase(seedPhrase);
        const descriptors = createTaprootDescriptor(xpub, masterFingerprint, path);

        return {
            xpub,
            masterFingerprint,
            path,
            descriptors
        };
    } catch (error) {
        console.error('Error generating descriptors:', error);
        throw error;
    }
}
