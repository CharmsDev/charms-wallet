import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';

// Initialize the ECC library for bitcoinjs-lib
bitcoin.initEccLib(ecc);

// Decode Bitcoin transaction hex in a format similar to bitcoin-cli decoderawtransaction
export function decodeTx(txHex) {
    try {
        const tx = bitcoin.Transaction.fromHex(txHex);

        const txid = tx.getId();
        const hash = txid; // For non-segwit txs, hash and txid are the same
        const version = tx.version;
        const locktime = tx.locktime;
        const size = txHex.length / 2;
        const weight = tx.weight();
        const vsize = Math.ceil(weight / 4);

        // Format inputs (vin)
        const vin = tx.ins.map((input) => {
            const inputTxid = Buffer.from(input.hash).reverse().toString('hex');
            const scriptSigHex = input.script.toString('hex');

            return {
                txid: inputTxid,
                vout: input.index,
                scriptSig: {
                    asm: "", // We don't parse ASM here
                    hex: scriptSigHex || ""
                },
                sequence: input.sequence
            };
        });

        // Format outputs (vout)
        const vout = tx.outs.map((output, n) => {
            const scriptPubKeyHex = output.script.toString('hex');
            let address = 'Unable to decode';
            let type = 'unknown';
            let asm = '';
            let desc = '';

            try {
                // Try to determine script type and address
                if (output.script.length === 34 && output.script[0] === 0x51 && output.script[1] === 0x20) {
                    type = 'witness_v1_taproot';
                    asm = `1 ${scriptPubKeyHex.substring(4)}`;
                    desc = `rawtr(${scriptPubKeyHex.substring(4)})`;

                    try {
                        address = bitcoin.address.fromOutputScript(output.script, bitcoin.networks.testnet);
                    } catch (e) {
                        address = `Unable to decode address`;
                    }
                } else {
                    // Handle other script types if needed
                    asm = `Script: ${scriptPubKeyHex}`;
                }
            } catch (e) {
                console.error('Error decoding output script:', e);
            }

            return {
                value: output.value / 100000000, // Convert to BTC
                n,
                scriptPubKey: {
                    asm,
                    desc,
                    hex: scriptPubKeyHex,
                    address,
                    type
                }
            };
        });

        // Format the result similar to bitcoin-cli output
        return {
            txid,
            hash,
            version,
            size,
            vsize,
            weight,
            locktime,
            vin,
            vout
        };
    } catch (error) {
        console.error('Error decoding transaction:', error);
        return {
            error: `Failed to decode transaction: ${error.message}`,
            txHex
        };
    }
}

// No longer needed as we're displaying the JSON directly
