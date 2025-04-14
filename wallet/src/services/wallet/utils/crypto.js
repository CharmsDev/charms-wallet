import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { BIP32Factory } from 'bip32';
import { ECPairFactory } from 'ecpair';

// Initialize ECC, BIP32, and ECPair
bitcoin.initEccLib(ecc);
const bip32 = BIP32Factory(ecc);
const ECPair = ECPairFactory(ecc);

// Convert a public key to x-only format (for Taproot)
export function toXOnly(pubkey) {
    return pubkey.length === 33 ? Buffer.from(pubkey.slice(1, 33)) : pubkey;
}

// Creates a key pair from a private key
export const createKeyPair = (privateKey) => {
    return ECPair.fromPrivateKey(privateKey);
};

// Derives a child node from the root node using the derivation path
export const deriveChildNode = (seed, derivationPath, network) => {
    const root = bip32.fromSeed(seed, network);
    return root.derivePath(derivationPath);
};

// Determines the input type from the scriptPubKey
export const determineInputType = (scriptPubKey, address) => {
    // Always prioritize scriptPubKey over address prefix
    // This is more reliable as the address might not match the actual script type

    if (scriptPubKey.startsWith('5120')) {
        console.log(`ScriptPubKey ${scriptPubKey} is Taproot, using p2tr`);
        return 'p2tr';
    } else if (scriptPubKey.startsWith('76a9') && scriptPubKey.endsWith('88ac')) {
        console.log(`ScriptPubKey ${scriptPubKey} is P2PKH, using p2pkh`);
        return 'p2pkh';
    } else if (scriptPubKey.startsWith('a914') && scriptPubKey.endsWith('87')) {
        console.log(`ScriptPubKey ${scriptPubKey} is P2SH, using p2sh`);
        return 'p2sh';
    } else if (scriptPubKey.startsWith('0014')) {
        console.log(`ScriptPubKey ${scriptPubKey} is P2WPKH, using p2wpkh`);
        return 'p2wpkh';
    } else if (scriptPubKey.startsWith('0020')) {
        console.log(`ScriptPubKey ${scriptPubKey} is P2WSH, using p2wsh`);
        return 'p2wsh';
    }

    // If scriptPubKey doesn't match any known pattern, check address prefix as fallback
    if (address && (address.startsWith('bc1p') || address.startsWith('tb1p'))) {
        console.log(`Address ${address} is a Taproot address, using p2tr`);
        return 'p2tr';
    } else if (address && (address.startsWith('bc1') || address.startsWith('tb1'))) {
        console.log(`Address ${address} is a SegWit address, using p2wpkh`);
        return 'p2wpkh';
    }

    // Default to p2pkh for unknown scripts
    console.log(`Unknown scriptPubKey ${scriptPubKey}, defaulting to p2pkh`);
    return 'p2pkh';
};

// Validates if the scriptPubKey matches the expected type
export const validateScriptPubKey = (scriptPubKey, expectedType) => {
    const actualType = determineInputType(scriptPubKey, '');
    return actualType === expectedType;
};

export default {
    toXOnly,
    createKeyPair,
    deriveChildNode,
    determineInputType,
    validateScriptPubKey
};
