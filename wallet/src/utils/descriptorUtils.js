'use client';

import * as bitcoin from 'bitcoinjs-lib';
import * as bip39 from 'bip39';
import * as ecc from 'tiny-secp256k1';
import { BIP32Factory } from 'bip32';

// Initialize bitcoinjs-lib with the ECC library
bitcoin.initEccLib(ecc);

// Initialize BIP32
const bip32 = BIP32Factory(ecc);

// Derives the extended keys from a seed phrase for testnet
export async function deriveXpubFromSeedPhrase(seedPhrase, path = "m/86'/0'/0'") {
    try {
        // Convert seed phrase to seed
        const seed = await bip39.mnemonicToSeed(seedPhrase);

        // Derive the master node using testnet network
        const masterNode = bip32.fromSeed(seed, bitcoin.networks.testnet);

        // Get the master key fingerprint as an 8-character hexadecimal string
        // The fingerprint is a 4-byte buffer, we need to convert it to an 8-character hex string

        // Get the fingerprint as a Buffer
        const fingerprintBuffer = masterNode.fingerprint;

        // Convert the Buffer to a hex string
        const masterFingerprint = Buffer.from(fingerprintBuffer).toString('hex');

        console.log('Fingerprint as hex:', masterFingerprint);

        // Derive the account node
        const accountNode = masterNode.derivePath(path);

        // Get the xpub (for testnet, this will be a tpub)
        const xpub = accountNode.neutered().toBase58();

        // Get the xpriv (for testnet, this will be a tprv)
        const xpriv = accountNode.toBase58();

        // Format the derivation path for the descriptor
        const pathParts = path.split('/').slice(1);
        const formattedPath = pathParts.map(part => {
            if (part.endsWith("'")) {
                return part.replace("'", "h");
            }
            return part;
        }).join('/');

        return {
            xpub,
            xpriv,
            fingerprint: masterFingerprint,
            path: formattedPath
        };
    } catch (error) {
        console.error("Error deriving xpub:", error);
        throw error;
    }
}

// Generates a descriptor wallet import command for Bitcoin Core testnet
export async function generateDescriptorImportCommand(seedPhrase, path = "m/86'/0'/0'") {
    try {
        const { xpub, xpriv, fingerprint, path: formattedPath } = await deriveXpubFromSeedPhrase(seedPhrase, path);

        // Create the descriptor string for testnet using taproot (tr) with private key
        const descriptor = `tr([${fingerprint}/${formattedPath}]${xpriv}/*)`;

        // Create the import command
        const command = `bitcoin-cli importdescriptors '[
  {
    "desc": "${descriptor}/0/*",
    "active": true,
    "timestamp": "now",
    "internal": false,
    "range": [0, 1000]
  },
  {
    "desc": "${descriptor}/1/*",
    "active": true,
    "timestamp": "now",
    "internal": true,
    "range": [0, 1000]
  }
]'`;

        return {
            command,
            descriptor,
            xpub,
            xpriv,
            fingerprint,
            path: formattedPath
        };
    } catch (error) {
        console.error("Error generating descriptor import command:", error);
        throw error;
    }
}
