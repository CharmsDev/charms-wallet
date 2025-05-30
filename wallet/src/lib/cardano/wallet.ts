'use client';

import * as bip39 from 'bip39';
import { getCardanoWasm, waitForCardanoWasm } from './cardanoWasm';

// Constants for Cardano derivation paths
const CARDANO_PURPOSE = 1852; // Cardano purpose for BIP44
const CARDANO_COIN_TYPE = 1815; // Cardano coin type
const CARDANO_ACCOUNT = 0; // Default account index
const PAYMENT_KEY_INDEX = 0; // Index for payment keys
const STAKING_KEY_INDEX = 2; // Index for staking keys

// Get network ID based on network name
const getNetworkId = (network: string): number => {
    return network === 'mainnet' ? 1 : 0; // 1 for mainnet, 0 for testnet
};

// Convert a mnemonic seed phrase to a Cardano root key
export const seedPhraseToRootKey = async (seedPhrase: string): Promise<any> => {
    // Validate the seed phrase
    if (!bip39.validateMnemonic(seedPhrase)) {
        throw new Error('Invalid seed phrase');
    }

    // Convert mnemonic to entropy
    const entropy = bip39.mnemonicToEntropy(seedPhrase);

    // Convert entropy to buffer
    const entropyBuffer = Buffer.from(entropy, 'hex');

    // Create root key from entropy
    const CardanoLib = getCardanoWasm();
    const rootKey = CardanoLib.Bip32PrivateKey.from_bip39_entropy(
        entropyBuffer,
        Buffer.from('') // No password
    );

    return rootKey;
};

// Derive a payment key from the root key
export const derivePaymentKey = async (
    rootKey: any,
    addressIndex: number = 0
): Promise<any> => {
    // Derive using path m/1852'/1815'/0'/0/i
    return rootKey
        .derive(CARDANO_PURPOSE | 0x80000000) // Purpose with hardened flag
        .derive(CARDANO_COIN_TYPE | 0x80000000) // Coin type with hardened flag
        .derive(CARDANO_ACCOUNT | 0x80000000) // Account with hardened flag
        .derive(PAYMENT_KEY_INDEX) // Payment key role
        .derive(addressIndex); // Address index
};

// Derive a staking key from the root key
export const deriveStakingKey = async (
    rootKey: any,
    addressIndex: number = 0
): Promise<any> => {
    // Derive using path m/1852'/1815'/0'/2/i
    return rootKey
        .derive(CARDANO_PURPOSE | 0x80000000) // Purpose with hardened flag
        .derive(CARDANO_COIN_TYPE | 0x80000000) // Coin type with hardened flag
        .derive(CARDANO_ACCOUNT | 0x80000000) // Account with hardened flag
        .derive(STAKING_KEY_INDEX) // Staking key role
        .derive(addressIndex); // Address index
};

// Generate a Cardano address from payment and staking keys
export const generateAddress = async (
    paymentKey: any,
    stakingKey: any,
    network: string
): Promise<string> => {
    // Get network ID
    const networkId = getNetworkId(network);

    // Get public keys
    const paymentPubKey = paymentKey.to_public();
    const stakingPubKey = stakingKey.to_public();

    // Create key hashes
    const paymentKeyHash = paymentPubKey.to_raw_key().hash();
    const stakingKeyHash = stakingPubKey.to_raw_key().hash();

    // Create credentials
    const CardanoLib = getCardanoWasm();
    const paymentCredential = CardanoLib.Credential.from_keyhash(paymentKeyHash);
    const stakingCredential = CardanoLib.Credential.from_keyhash(stakingKeyHash);

    // Create address
    const baseAddress = CardanoLib.BaseAddress.new(
        networkId,
        paymentCredential,
        stakingCredential
    );

    // Convert to bech32 address
    return baseAddress.to_address().to_bech32();
};

// Generate a Cardano address from the seed phrase
export const generateCardanoAddress = async (
    seedPhrase: string,
    addressIndex: number = 0,
    network: string = 'preprod'
): Promise<string> => {
    try {
        // Get root key
        const rootKey = await seedPhraseToRootKey(seedPhrase);

        // Derive payment and staking keys
        const paymentKey = await derivePaymentKey(rootKey, addressIndex);
        const stakingKey = await deriveStakingKey(rootKey, addressIndex);

        // Generate address
        const address = await generateAddress(paymentKey, stakingKey, network);

        return address;
    } catch (error) {
        throw error;
    }
};

// Get the private key for a Cardano address
export const deriveCardanoPrivateKey = async (
    seedPhrase: string,
    addressIndex: number = 0,
    isStaking: boolean = false
): Promise<string> => {
    try {
        // Get root key
        const rootKey = await seedPhraseToRootKey(seedPhrase);

        // Derive key based on type
        const derivedKey = isStaking
            ? await deriveStakingKey(rootKey, addressIndex)
            : await derivePaymentKey(rootKey, addressIndex);

        // Convert to hex
        const privateKeyBytes = derivedKey.to_raw_key().as_bytes();
        return Buffer.from(privateKeyBytes).toString('hex');
    } catch (error) {
        throw error;
    }
};

// Validate a Cardano address
export const validateCardanoAddress = async (address: string): Promise<boolean> => {
    try {
        // Try to parse the address
        const CardanoLib = getCardanoWasm();
        CardanoLib.Address.from_bech32(address);
        return true;
    } catch (error) {
        return false;
    }
};

// Get the derivation path for a Cardano address
export const getCardanoDerivationPath = (
    addressIndex: number = 0,
    isStaking: boolean = false
): string => {
    const role = isStaking ? STAKING_KEY_INDEX : PAYMENT_KEY_INDEX;
    return `m/${CARDANO_PURPOSE}'/${CARDANO_COIN_TYPE}'/${CARDANO_ACCOUNT}'/${role}/${addressIndex}`;
};
