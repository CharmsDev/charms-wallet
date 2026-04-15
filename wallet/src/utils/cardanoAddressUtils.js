'use client';

import { getCardanoDerivationPath } from '@/lib/cardano/cardanoSimple';
import config from '@/config';

// Generates a new Cardano address using the real CSL library (dynamic import)
export async function generateCardanoAddressFromSeed(seedPhrase, index, isStaking = false) {
    const { generateCardanoAddress } = await import('@/lib/cardano/wallet');
    const network = config.cardano.network;
    return await generateCardanoAddress(seedPhrase, index, network);
}

// Derives the private key for a given address index
export async function deriveCardanoPrivateKeyFromSeed(seedPhrase, index, isStaking = false) {
    const { deriveCardanoPrivateKey } = await import('@/lib/cardano/wallet');
    return await deriveCardanoPrivateKey(seedPhrase, index, isStaking);
}

// Validates a Cardano address (uses real CSL when available, falls back to prefix check)
export async function validateCardanoAddressFormat(address) {
    try {
        const { validateCardanoAddress } = await import('@/lib/cardano/wallet');
        return await validateCardanoAddress(address);
    } catch {
        // Fallback: basic prefix validation
        return address?.startsWith('addr1') || address?.startsWith('addr_test1') || false;
    }
}

// Gets the derivation path for a Cardano address (pure, no WASM needed)
export function getCardanoAddressDerivationPath(index, isStaking = false) {
    return getCardanoDerivationPath(index, isStaking);
}

// Copies text to clipboard
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

// Organizes Cardano addresses into payment and staking addresses (pure, no WASM)
export function organizeCardanoAddresses(addresses) {
    const paymentAddresses = addresses.filter(addr => !addr.isStaking);
    const stakingAddresses = addresses.filter(addr => addr.isStaking);
    return { paymentAddresses, stakingAddresses };
}
