import * as bitcoin from 'bitcoinjs-lib';

// Parse transaction hex to extract details
export function parseTx(txHex) {
    const tx = bitcoin.Transaction.fromHex(txHex);

    // Parse inputs
    const inputs = tx.ins.map((input, index) => {
        const txid = Buffer.from(input.hash).reverse().toString('hex');
        const vout = input.index;
        const sequence = input.sequence;
        return {
            index,
            txid,
            vout,
            sequence,
            witness: input.witness.map(w => w.toString('hex'))
        };
    });

    // Parse outputs
    const outputs = tx.outs.map((output, index) => {
        const value = output.value;
        const script = output.script.toString('hex');
        return {
            index,
            value,
            script
        };
    });

    return {
        version: tx.version,
        locktime: tx.locktime,
        inputs,
        outputs,
        txid: tx.getId()
    };
}

// Verify a transaction signature
export function verifyTxSignature(txHex) {
    try {
        // This is a simplified check - just ensures the transaction parses
        // and all inputs have witness data (signatures)
        const tx = bitcoin.Transaction.fromHex(txHex);

        // Check that all inputs have witness data
        const allSigned = tx.ins.every(input =>
            input.witness && input.witness.length > 0
        );

        return allSigned;
    } catch (error) {
        console.error('Error verifying transaction:', error);
        return false;
    }
}

// Decode a transaction hex string
export function decodeTx(txHex) {
    try {
        const tx = bitcoin.Transaction.fromHex(txHex);

        // Extract basic transaction info
        const result = {
            txid: tx.getId(),
            version: tx.version,
            locktime: tx.locktime,
            size: txHex.length / 2,
            weight: tx.weight(),
            vsize: Math.ceil(tx.weight() / 4),
            inputs: [],
            outputs: []
        };

        // Extract input details
        result.inputs = tx.ins.map((input, index) => {
            const txid = Buffer.from(input.hash).reverse().toString('hex');
            return {
                index,
                txid,
                vout: input.index,
                sequence: input.sequence,
                scriptSig: input.script.toString('hex'),
                witness: input.witness.map(w => w.toString('hex'))
            };
        });

        // Extract output details
        result.outputs = tx.outs.map((output, index) => {
            let address = 'unknown';
            try {
                // Try to extract address from output script
                // This might fail for non-standard scripts
                address = bitcoin.address.fromOutputScript(output.script, bitcoin.networks.testnet);
            } catch (e) {
                // If we can't extract an address, just use the script
            }

            return {
                index,
                value: output.value,
                scriptPubKey: output.script.toString('hex'),
                address
            };
        });

        return result;
    } catch (error) {
        console.error('Error decoding transaction:', error);
        throw error;
    }
}

export default {
    parseTx,
    verifyTxSignature,
    decodeTx
};
