import * as bip39 from 'bip39';

// Generate BIP39 mnemonic in memory. Persistence is the caller's
// responsibility — encrypt with the passkey blob (services/auth) or
// fall back to plaintext storage (services/storage.saveSeedPhrase).
export async function generateSeedPhrase(): Promise<string> {
    return bip39.generateMnemonic();
}

// Validate and normalize a BIP39 mnemonic. Does not persist.
export async function importSeedPhrase(seedPhrase: string): Promise<string> {
    const normalized = seedPhrase.trim().toLowerCase();
    if (!bip39.validateMnemonic(normalized)) {
        throw new Error('Invalid seed phrase. Please check and try again.');
    }
    return normalized;
}
