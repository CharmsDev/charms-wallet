import { ec } from './common';

export class LegacyTransactionService {
    prepareLegacyTransaction(txHex: string, signature: string, privateKey: string, sigHashType: string = '01'): string {
        // Import private key to get public key
        const keyPair = ec.keyFromPrivate(privateKey);
        const publicKey = keyPair.getPublic().encode('hex', true); // true for compressed format

        // Create scriptSig from signature and public key
        const signatureWithHashType = `${signature}${sigHashType}`;
        const sigLengthByte = (signatureWithHashType.length / 2).toString(16).padStart(2, '0');
        const pubKeyLengthByte = (publicKey.length / 2).toString(16).padStart(2, '0');
        const scriptSig = `${sigLengthByte}${signatureWithHashType}${pubKeyLengthByte}${publicKey}`;
        const scriptLength = (scriptSig.length / 2).toString(16).padStart(2, '0');

        // Parse transaction parts
        const version = txHex.slice(0, 8);
        const inputCount = txHex.slice(8, 10);
        const inputs = [];
        let pos = 10;

        // Read inputs
        const numInputs = parseInt(inputCount, 16);
        for (let i = 0; i < numInputs; i++) {
            const txid = txHex.slice(pos, pos + 64);
            pos += 64;
            const vout = txHex.slice(pos, pos + 8);
            pos += 8;
            const scriptLen = parseInt(txHex.slice(pos, pos + 2), 16);
            pos += 2;
            const script = txHex.slice(pos, pos + scriptLen * 2);
            pos += scriptLen * 2;
            const sequence = txHex.slice(pos, pos + 8);
            pos += 8;
            inputs.push({ txid, vout, script, sequence });
        }

        // Read outputs and rest of tx
        const restOfTx = txHex.slice(pos);

        // Build signed transaction
        let signedTx = version + inputCount;
        inputs.forEach((input, i) => {
            signedTx += input.txid + input.vout;
            if (i === 0) {
                // Only sign the first input
                signedTx += scriptLength + scriptSig;
            } else {
                signedTx += '00'; // Empty script for other inputs
            }
            signedTx += input.sequence;
        });
        signedTx += restOfTx;

        return signedTx;
    }

    prepareSegWitTransaction(txHex: string, signature: string, privateKey: string, sigHashType: string = '01'): string {
        // For SegWit transactions, we need to keep the scriptSig empty and put the signature in the witness
        console.log('Preparing SegWit transaction with hex:', txHex);

        // Parse transaction parts
        const version = txHex.slice(0, 8);
        console.log('Version:', version);
        let pos = 8;

        // Check if this is already a SegWit transaction (has marker and flag)
        const hasWitnessMarker = txHex.slice(pos, pos + 4) === '0001';
        if (hasWitnessMarker) {
            console.log('Found SegWit marker and flag');
            pos += 4;
        } else {
            console.log('No SegWit marker and flag found, will add them');
        }

        const inputCount = txHex.slice(pos, pos + 2);
        console.log('Input count:', inputCount);
        pos += 2;

        const inputs = [];
        const numInputs = parseInt(inputCount, 16);
        console.log('Number of inputs:', numInputs);
        for (let i = 0; i < numInputs; i++) {
            const txid = txHex.slice(pos, pos + 64);
            pos += 64;
            const vout = txHex.slice(pos, pos + 8);
            pos += 8;
            const scriptLen = parseInt(txHex.slice(pos, pos + 2), 16);
            pos += 2;
            const script = txHex.slice(pos, pos + scriptLen * 2);
            pos += scriptLen * 2;
            const sequence = txHex.slice(pos, pos + 8);
            pos += 8;
            inputs.push({ txid, vout, script, sequence });
            console.log(`Input ${i}:`, { txid, vout, scriptLen, script, sequence });
        }

        // Read outputs
        const outputCount = txHex.slice(pos, pos + 2);
        console.log('Output count:', outputCount);
        pos += 2;

        let outputs = outputCount;
        const numOutputs = parseInt(outputCount, 16);
        console.log('Number of outputs:', numOutputs);
        for (let i = 0; i < numOutputs; i++) {
            const value = txHex.slice(pos, pos + 16);
            pos += 16;
            const scriptLen = parseInt(txHex.slice(pos, pos + 2), 16);
            pos += 2;
            const script = txHex.slice(pos, pos + scriptLen * 2);
            pos += scriptLen * 2;
            outputs += value + (scriptLen.toString(16).padStart(2, '0')) + script;
            console.log(`Output ${i}:`, { value, scriptLen, script });
        }

        // Read any existing witness data
        let witnessData = '';
        if (hasWitnessMarker && pos < txHex.length - 8) { // Check if there's witness data (excluding locktime)
            witnessData = txHex.slice(pos, txHex.length - 8);
            console.log('Existing witness data:', witnessData);
        }

        // Read locktime
        const locktime = txHex.slice(txHex.length - 8);
        console.log('Locktime:', locktime);

        // Build signed transaction with SegWit marker and flag
        let signedTx = version + '0001' + inputCount;

        // Add inputs with empty scriptSigs
        inputs.forEach(input => {
            signedTx += input.txid + input.vout + '00' + input.sequence; // Empty scriptSig
        });

        signedTx += outputs;

        // Build witness data
        let witness = '';

        // Regular SegWit transaction (P2WPKH or P2WSH)
        console.log('Building witness for regular SegWit transaction');

        // Import private key to get public key
        const keyPair = ec.keyFromPrivate(privateKey);
        const publicKey = keyPair.getPublic().encode('hex', true); // true for compressed format
        console.log('Public key:', publicKey);

        // Create witness data with the provided signature hash type
        const signatureWithHashType = `${signature}${sigHashType}`;
        console.log('Signature with hash type:', signatureWithHashType);

        // For P2WPKH, we need two witness items: signature and public key
        const witnessItemCount = '02';

        // Add signature with hash type
        const sigLen = (signatureWithHashType.length / 2).toString(16).padStart(2, '0');
        const pubKeyLen = (publicKey.length / 2).toString(16).padStart(2, '0');
        const witnessForFirstInput = witnessItemCount + sigLen + signatureWithHashType + pubKeyLen + publicKey;

        // Build the witness section for regular SegWit
        for (let i = 0; i < numInputs; i++) {
            if (i === 0) {
                witness += witnessForFirstInput;
                console.log(`SegWit witness for input ${i}:`, witnessForFirstInput);
            } else {
                witness += '00'; // Empty witness for other inputs
                console.log(`Empty witness for input ${i}`);
            }
        }

        signedTx += witness + locktime;

        console.log('Prepared SegWit transaction:', signedTx);
        return signedTx;
    }
}

export const legacyTransactionService = new LegacyTransactionService();
