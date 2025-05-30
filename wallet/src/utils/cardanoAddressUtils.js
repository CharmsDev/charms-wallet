'use client';

import { generateCardanoAddress, deriveCardanoPrivateKey, validateCardanoAddress, getCardanoDerivationPath } from '@/lib/cardano/cardanoSimple';
import { NETWORKS } from '@/stores/blockchainStore';

// Generates a new Cardano address using the specified derivation path
export async function generateCardanoAddressFromSeed(seedPhrase, index, isStaking = false) {
    try {
        // Get the network from environment variable or use testnet by default
        const network = process.env.NEXT_PUBLIC_CARDANO_NETWORK || NETWORKS.CARDANO.TESTNET;

        // Generate the address
        const address = await generateCardanoAddress(seedPhrase, index, network);

        return address;
    } catch (error) {
        throw error;
    }
}

// Derives the private key for a given address index
export async function deriveCardanoPrivateKeyFromSeed(seedPhrase, index, isStaking = false) {
    try {
        // Derive the private key
        const privateKey = await deriveCardanoPrivateKey(seedPhrase, index, isStaking);

        return privateKey;
    } catch (error) {
        throw error;
    }
}

// Validates a Cardano address
export async function validateCardanoAddressFormat(address) {
    return await validateCardanoAddress(address);
}

// Gets the derivation path for a Cardano address
export function getCardanoAddressDerivationPath(index, isStaking = false) {
    return getCardanoDerivationPath(index, isStaking);
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

// Organizes Cardano addresses into payment and staking addresses
export function organizeCardanoAddresses(addresses) {
    const paymentAddresses = addresses.filter(addr => !addr.isStaking);
    const stakingAddresses = addresses.filter(addr => addr.isStaking);

    return { paymentAddresses, stakingAddresses };
}
