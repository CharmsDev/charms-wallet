import * as bip39 from 'bip39';
import { saveSeedPhrase } from '@/services/storage';

// Generate BIP39 mnemonic seed phrase
export async function generateSeedPhrase(): Promise<string> {
    const mnemonic = bip39.generateMnemonic();
    // Store seed phrase in local storage
    await saveSeedPhrase(mnemonic);
    return mnemonic;
}

// Validate and import BIP39 mnemonic seed phrase
export async function importSeedPhrase(seedPhrase: string): Promise<string> {
    // Trim and normalize the seed phrase
    const normalizedSeedPhrase = seedPhrase.trim().toLowerCase();

    // Validate the seed phrase
    if (!bip39.validateMnemonic(normalizedSeedPhrase)) {
        throw new Error('Invalid seed phrase. Please check and try again.');
    }

    // Store seed phrase in local storage
    await saveSeedPhrase(normalizedSeedPhrase);
    return normalizedSeedPhrase;
}
