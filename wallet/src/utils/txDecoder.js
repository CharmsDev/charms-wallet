import * as bitcoin from 'bitcoinjs-lib';

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
        throw error;
    }
}

export default {
    decodeTx
};
