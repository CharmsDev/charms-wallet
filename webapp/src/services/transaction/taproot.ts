import { schnorr } from '@noble/curves/secp256k1';
import { bytesToHex, hexToBytes, validatePrivateKey } from './common';

export class TaprootTransactionService {
    // Helper method to create a Schnorr signature for Taproot transactions
    async createSchnorrSignature(privateKey: Uint8Array, messageHash: Uint8Array): Promise<Uint8Array> {
        try {
            // Ensure private key is properly formatted
            if (privateKey.length !== 32) {
                console.log('Invalid private key length in bytes:', privateKey.length);
                console.log('Private key bytes:', privateKey);
                throw new Error('Private key must be exactly 32 bytes');
            }

            // Use the schnorr.sign method from @noble/curves/secp256k1
            return schnorr.sign(messageHash, privateKey);
        } catch (error: any) {
            console.error('Error creating Schnorr signature:', error);
            throw new Error(`Failed to create Schnorr signature: ${error.message || 'Unknown error'}`);
        }
    }

    prepareWitness(signature: string, sigHashType: string = '01', isScriptSpend: boolean = false, script?: string, controlBlock?: string): string {
        if (!isScriptSpend) {
            console.log('Building witness for Taproot key path spend');
            // Add signature with hash type for Taproot key path
            const signatureWithHashType = `${signature}${sigHashType}`;
            const sigLen = (signatureWithHashType.length / 2).toString(16).padStart(2, '0');
            return '01' + sigLen + signatureWithHashType;
        }

        console.log('Building witness for Taproot script path spend');
        if (!script || !controlBlock) {
            throw new Error('Script and control block are required for script path spending');
        }

        // Sanitize inputs to ensure they are valid hex strings
        const sanitizedScript = this.sanitizeHexInput(script);
        const sanitizedControlBlock = this.sanitizeHexInput(controlBlock);

        // Log sanitized values for debugging
        console.log('Original script:', script);
        console.log('Sanitized script:', sanitizedScript);
        console.log('Original control block:', controlBlock);
        console.log('Sanitized control block:', sanitizedControlBlock);

        // For script path spend, we need:
        // 1. Signature with SIGHASH_ALL_PLUS_ANYONE_CAN_PAY (0x81)
        const signatureWithHashType = `${signature}81`; // 0x81 for SIGHASH_ALL_PLUS_ANYONE_CAN_PAY
        const sigLen = (signatureWithHashType.length / 2).toString(16).padStart(2, '0');

        // 2. Script
        const scriptLen = (sanitizedScript.length / 2).toString(16).padStart(2, '0');

        // 3. Control block
        const controlBlockLen = (sanitizedControlBlock.length / 2).toString(16).padStart(2, '0');

        // Combine all witness elements (count = 3)
        return '03' +
            sigLen + signatureWithHashType +
            scriptLen + sanitizedScript +
            controlBlockLen + sanitizedControlBlock;
    }

    // Add a helper method to sanitize hex inputs
    private sanitizeHexInput(input: string): string {
        // Remove any non-hex characters
        return input.replace(/[^0-9a-fA-F]/g, '');
    }

    async signTaprootTransaction(txHex: string, privateKey: string, messageHash: Uint8Array, isScriptSpend: boolean = false): Promise<string> {
        const normalizedPrivateKey = validatePrivateKey(privateKey);
        const privateKeyBytes = hexToBytes(normalizedPrivateKey);

        // For script path spending, use SIGHASH_ALL_PLUS_ANYONE_CAN_PAY (0x81)
        // For key path spending, use SIGHASH_ALL (0x01)
        const sighashType = isScriptSpend ? 0x81 : 0x01;

        // Append sighash type to message hash before signing
        const messageHashWithSighash = new Uint8Array(messageHash.length + 1);
        messageHashWithSighash.set(messageHash);
        messageHashWithSighash[messageHash.length] = sighashType;
        console.log('Message hash with sighash:', bytesToHex(messageHashWithSighash));

        const schnorrSignature = await this.createSchnorrSignature(privateKeyBytes, messageHashWithSighash);
        return bytesToHex(schnorrSignature);
    }
}

export const taprootTransactionService = new TaprootTransactionService();