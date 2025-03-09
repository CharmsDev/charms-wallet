import * as bip39 from 'bip39';
import { saveSeedPhrase } from '@/services/storage';

// Generates a new BIP39 mnemonic seed phrase
export async function generateSeedPhrase(): Promise<string> {
    const mnemonic = bip39.generateMnemonic();
    // Store the seed phrase in local storage
    await saveSeedPhrase(mnemonic);
    return mnemonic;
}
