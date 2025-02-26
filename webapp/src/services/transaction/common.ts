import { ec as EC } from 'elliptic';
import bs58 from 'bs58';
import type { CommitTxInfo } from '../../types';

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return new Uint8Array(hashBuffer);
}

export function sanitizeHexString(input: string): string {
    // Remove any non-hex characters and ensure it has an even length
    let sanitized = input.replace(/[^0-9a-fA-F]/g, '');

    // Ensure even length by adding leading zero if needed
    if (sanitized.length % 2 !== 0) {
        sanitized = '0' + sanitized;
    }

    return sanitized;
}

export function hexToBytes(hex: string): Uint8Array {
    // First attempt to sanitize the hex string
    const sanitizedHex = sanitizeHexString(hex);

    // If we end up with an empty string after sanitization, throw error
    if (sanitizedHex.length === 0) {
        throw new Error('Invalid hex string: contains no valid hex characters');
    }

    const bytes = new Uint8Array(sanitizedHex.length / 2);
    for (let i = 0; i < sanitizedHex.length; i += 2) {
        bytes[i / 2] = parseInt(sanitizedHex.slice(i, i + 2), 16);
    }
    return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

// Helper function to validate and normalize a private key
export function validatePrivateKey(privateKey: string): string {
    console.log('Validating private key:', privateKey);

    // Check if this is a BIP32 extended private key (starts with tprv)
    if (privateKey.startsWith('tprv')) {
        try {
            // Decode the base58 string
            const decoded = bs58.decode(privateKey);
            // Extract the key part (last 32 bytes)
            const keyPart = new Uint8Array(decoded.slice(-32));
            // Convert to hex
            const hexKey = Array.from(keyPart)
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
            console.log('Extracted private key from tprv:', hexKey);
            return hexKey;
        } catch (error) {
            throw new Error('Failed to decode extended private key');
        }
    }

    // Handle regular hex format
    if (!/^[0-9a-fA-F]*$/.test(privateKey)) {
        throw new Error('Invalid private key format: not a hex string');
    }

    // Remove any '0x' prefix if present
    const cleanKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
    console.log('Cleaned private key:', cleanKey);

    // Ensure the key is exactly 64 hex characters (32 bytes)
    if (cleanKey.length !== 64) {
        throw new Error(`Invalid private key length. Expected 32 bytes (64 hex chars), got ${cleanKey.length / 2} bytes (${cleanKey.length} hex chars)`);
    }

    return cleanKey;
}

export function findOutputsStart(txHex: string): number {
    // Parse transaction to find where outputs start
    const version = txHex.slice(0, 8);
    let pos = 8;

    // Check for SegWit marker and flag
    if (txHex.slice(pos, pos + 4) === '0001') {
        pos += 4;
    }

    const inputCount = parseInt(txHex.slice(pos, pos + 2), 16);
    pos += 2;

    // Skip inputs
    for (let i = 0; i < inputCount; i++) {
        pos += 64; // txid
        pos += 8;  // vout
        const scriptLen = parseInt(txHex.slice(pos, pos + 2), 16);
        pos += 2;
        pos += scriptLen * 2; // script
        pos += 8; // sequence
    }

    return pos;
}

export function hasTaprootOutput(txHex: string): boolean {
    const outputsStart = findOutputsStart(txHex);
    if (outputsStart > 0) {
        const outputs = txHex.slice(outputsStart);
        return outputs.includes('5120'); // P2TR starts with 5120
    }
    return false;
}

export const ec = new EC('secp256k1');
