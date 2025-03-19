import * as bip39 from 'bip39';
import { saveSeedPhrase } from '@/services/storage';

// Generate BIP39 mnemonic seed phrase
export async function generateSeedPhrase(): Promise<string> {
    const mnemonic = bip39.generateMnemonic();
    // Store seed phrase in local storage
    await saveSeedPhrase(mnemonic);
    return mnemonic;
}
