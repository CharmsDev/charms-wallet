import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';

if (!bitcoin.ecc) {
    bitcoin.initEccLib(ecc);
}

// Decodes a Bitcoin transaction hex string into a structured object
export function decodeTx(txHex) {
    try {
        const tx = bitcoin.Transaction.fromHex(txHex);

        const txid = tx.getId();
        const version = tx.version;
        const locktime = tx.locktime;

        const inputs = tx.ins.map((input, index) => ({
            index,
            txid: Buffer.from(input.hash).reverse().toString('hex'),
            vout: input.index,
            sequence: input.sequence,
            scriptSig: input.script.toString('hex') || '(empty)',
            witness: input.witness.map(item => item.toString('hex')),
            hasWitness: input.witness.length > 0
        }));

        const outputs = tx.outs.map((output, index) => {
            let address = 'Unable to decode';
            let type = 'Unknown';

            try {
                if (output.script.length === 34 && output.script[0] === 0x51 && output.script[1] === 0x20) {
                    type = 'P2TR';
                    try {
                        address = bitcoin.address.fromOutputScript(output.script, bitcoin.networks.testnet);
                    } catch (e) {
                        address = `Script: ${output.script.toString('hex')}`;
                    }
                } else {
                    type = 'Non-Taproot';
                    address = `Script: ${output.script.toString('hex')}`;
                }
            } catch (e) {
                address = `Script: ${output.script.toString('hex')}`;
            }

            return {
                index,
                value: output.value,
                valueInBTC: output.value / 100000000,
                scriptPubKey: output.script.toString('hex'),
                type,
                address
            };
        });

        const totalOutput = outputs.reduce((sum, output) => sum + output.value, 0);

        return {
            txid,
            version,
            locktime,
            inputs,
            outputs,
            totalOutput,
            totalOutputBTC: totalOutput / 100000000,
            size: txHex.length / 2,
            weight: tx.weight(),
            vsize: Math.ceil(tx.weight() / 4),
            hasWitness: tx.hasWitnesses()
        };
    } catch (error) {
        console.error('Error decoding transaction:', error);
        return {
            error: `Failed to decode transaction: ${error.message}`,
            txHex
        };
    }
}

// Formats a decoded transaction into a human-readable string
export function formatDecodedTx(decodedTx) {
    if (decodedTx.error) {
        return `Error: ${decodedTx.error}`;
    }

    let result = `Transaction ID: ${decodedTx.txid}\n`;
    result += `Version: ${decodedTx.version}\n`;
    result += `Locktime: ${decodedTx.locktime}\n`;
    result += `Size: ${decodedTx.size} bytes\n`;
    result += `Weight: ${decodedTx.weight}\n`;
    result += `Virtual Size: ${decodedTx.vsize} vbytes\n`;
    result += `Has Witness: ${decodedTx.hasWitness ? 'Yes' : 'No'}\n\n`;

    result += `Inputs (${decodedTx.inputs.length}):\n`;
    decodedTx.inputs.forEach(input => {
        result += `  #${input.index}: ${input.txid}:${input.vout}, Sequence: ${input.sequence}, ScriptSig: ${input.scriptSig}`;
        if (input.hasWitness) {
            result += `, Witness: ${input.witness.join(', ')}`;
        }
        result += '\n';
    });

    result += `Outputs (${decodedTx.outputs.length}):\n`;
    decodedTx.outputs.forEach(output => {
        result += `  #${output.index}: Value: ${output.value} satoshis (${output.valueInBTC.toFixed(8)} BTC), Type: ${output.type}, Address: ${output.address}, ScriptPubKey: ${output.scriptPubKey}\n`;
    });

    result += `Total Output: ${decodedTx.totalOutput} satoshis (${decodedTx.totalOutputBTC.toFixed(8)} BTC)\n`;

    return result;
}
