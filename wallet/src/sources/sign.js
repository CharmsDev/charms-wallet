// ------ ALL INPUTS AND CONFIGURATION ------

// Required libraries
import * as sdk from '@unisat/wallet-sdk';
import * as bip39 from 'bip39';
import * as ecc from 'tiny-secp256k1';
import { BIP32Factory } from 'bip32';

// Extract needed components from SDK
const { AddressType } = sdk;
const { LocalWallet } = sdk.wallet;
const { bitcoin } = sdk.core;

// Create BIP32 instance
const bip32 = BIP32Factory(ecc);

// Network settings (testnet or mainnet)
const network = bitcoin.networks.testnet;

// Your BIP-39 seed phrase (12 or 24 words)
const seedPhrase = 'weird view crack fork nut custom hidden tent sketch dutch energy easy';

// Original unsigned transaction (we'll extract all info from this)
const unsignedTxHex = "0200000001e56fade9ed4657a74fb49e17d35d80b57e632258c300ac76ce3d2ff62391694d0000000000ffffffff01a3490000000000002251200593fea30f55a0c6d5bf872f3722bab1e79a07c77921234b6fc002b4bd5877df00000000";

// Bitcoin CLI decoded transaction for reference
const decodeFromBitcoinCli = {
    "txid": "5c82b3baa586f384739bdea9279d2e1fb1b19970793256efafb0b1e6ecb42155",
    "hash": "5c82b3baa586f384739bdea9279d2e1fb1b19970793256efafb0b1e6ecb42155",
    "version": 2,
    "size": 94,
    "vsize": 94,
    "weight": 376,
    "locktime": 0,
    "vin": [
        {
            "txid": "4d699123f62f3dce76ac00c35822637eb5805dd3179eb44fa75746ede9ad6fe5",
            "vout": 0,
            "scriptSig": {
                "asm": "",
                "hex": ""
            },
            "sequence": 4294967295
        }
    ],
    "vout": [
        {
            "value": 0.00018851,
            "n": 0,
            "scriptPubKey": {
                "asm": "1 0593fea30f55a0c6d5bf872f3722bab1e79a07c77921234b6fc002b4bd5877df",
                "desc": "rawtr(0593fea30f55a0c6d5bf872f3722bab1e79a07c77921234b6fc002b4bd5877df)#ewkxmt66",
                "hex": "51200593fea30f55a0c6d5bf872f3722bab1e79a07c77921234b6fc002b4bd5877df",
                "address": "tb1pqkflagc02ksvd4dlsuhnwg46k8ne5p780ysjxjm0cqptf02cwl0sjehf0y",
                "type": "witness_v1_taproot"
            }
        }
    ]
};

// Helper function to decode script
function decodeScript(script) {
    try {
        if (script.length === 34 && script[0] === 0x51 && script[1] === 0x20) {
            const pubkey = script.slice(2).toString('hex');
            return {
                type: 'P2TR',
                internalKey: pubkey
            };
        }
        return {
            type: 'Unknown'
        };
    } catch (error) {
        return {
            type: 'Error'
        };
    }
}

// Parse the unsigned transaction to extract all necessary information
function parseUnsignedTx(txHex) {
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
            sequence
        };
    });

    // Parse outputs
    const outputs = tx.outs.map((output, index) => {
        const value = output.value;
        const script = output.script;
        const scriptDecoded = decodeScript(script);
        return {
            index,
            value,
            script: script.toString('hex'),
            scriptDecoded
        };
    });

    // Compare with Bitcoin CLI decode for validation
    console.log("Validation check:");
    console.log(`Parsed TXID input: ${inputs[0].txid}`);
    console.log(`Bitcoin CLI TXID input: ${decodeFromBitcoinCli.vin[0].txid}`);
    console.log(`Match: ${inputs[0].txid === decodeFromBitcoinCli.vin[0].txid}`);

    console.log(`Parsed output value: ${outputs[0].value}`);
    console.log(`Bitcoin CLI output value: ${Math.round(decodeFromBitcoinCli.vout[0].value * 100000000)}`);
    console.log(`Match: ${outputs[0].value === Math.round(decodeFromBitcoinCli.vout[0].value * 100000000)}`);

    return {
        version: tx.version,
        locktime: tx.locktime,
        utxoTxId: inputs[0].txid,
        utxoVout: inputs[0].vout,
        utxoSequence: inputs[0].sequence,
        outputAmount: outputs[0].value,
        outputScript: tx.outs[0].script,
        outputScriptHex: outputs[0].script,
        outputInternalKey: outputs[0].scriptDecoded.type === 'P2TR' ? outputs[0].scriptDecoded.internalKey : null
    };
}

// Extract all details from the unsigned transaction
const txDetails = parseUnsignedTx(unsignedTxHex);
console.log("\nTransaction Details extracted from unsignedTxHex:");
console.log(JSON.stringify(txDetails, null, 2));

// We need to know the UTXO amount and script for signing
// In a real-world scenario, this would be fetched from a blockchain API
// For this example, we'll use the value from decodeFromBitcoinCli or a known value

// UTXO details - using the txid and vout from the unsigned transaction
const utxoTxId = txDetails.utxoTxId;
const utxoVout = txDetails.utxoVout;
const utxoSequence = txDetails.utxoSequence;

// For this example, we know the UTXO is a P2TR output with this amount and internal key
const utxoAmount = 19073; // in satoshis
const utxoInternalKey = '6eb2ec4ab68e29176884e783dfd93bc42b9310f5ae47a202d0978988cebe1f87';
const utxoScript = Buffer.from(`5120${utxoInternalKey}`, 'hex');

// Output details - directly from the unsigned transaction
const outputScript = txDetails.outputScript;
const outputAmount = txDetails.outputAmount;
const inputIndex = 0;

// Use RBF sequence for the transaction
const rbfSequence = 0xFFFFFFFD;

// Derivation path for P2TR (BIP86)
const derivationPath = "m/86'/0'/0'/0/0"; // RJJ-TODO dynamic

// Create and sign the transaction using the extracted information
async function createSignedTransaction() {
    try {
        // Generate the wallet from the seed phrase
        const seed = await bip39.mnemonicToSeed(seedPhrase);
        const masterNode = bip32.fromSeed(seed, network);
        const accountNode = masterNode.derivePath("m/86'/0'/0'");
        const addressNode = accountNode.derive(0).derive(0);
        const wif = addressNode.toWIF();
        const wallet = new LocalWallet(wif, AddressType.P2TR, network);

        console.log("\nWallet Information:");
        console.log(`Address: ${wallet.address}`);
        console.log(`Public Key: ${wallet.pubkey.toString('hex')}`);

        // Create a new PSBT (Partially Signed Bitcoin Transaction)
        const psbt = new bitcoin.Psbt({ network });

        // Add the input using data from the unsigned transaction
        psbt.addInput({
            hash: utxoTxId,
            index: utxoVout,
            sequence: utxoSequence, // Use the sequence from the unsigned tx
            witnessUtxo: {
                script: utxoScript,
                value: utxoAmount
            },
            tapInternalKey: Buffer.from(utxoInternalKey, 'hex')
        });

        // Add the output using data from the unsigned transaction
        psbt.addOutput({
            script: outputScript,
            value: outputAmount
        });

        console.log("\nPSBT created with:");
        console.log(`Input TXID: ${utxoTxId}`);
        console.log(`Input Vout: ${utxoVout}`);
        console.log(`Input Amount: ${utxoAmount} satoshis`);
        console.log(`Output Amount: ${outputAmount} satoshis`);
        console.log(`Fee: ${utxoAmount - outputAmount} satoshis`);

        // Sign the PSBT
        const signedPsbt = await wallet.signPsbt(psbt, {
            autoFinalized: true,
            toSignInputs: [
                {
                    index: inputIndex,
                    publicKey: wallet.pubkey
                }
            ]
        });

        // Extract the final transaction
        const tx = signedPsbt.extractTransaction();
        const signedTxHex = tx.toHex();

        return {
            signedTxHex,
            txId: tx.getId(),
            address: wallet.address
        };
    } catch (error) {
        console.error('Error in transaction signing:', error);
        throw error;
    }
}

// Generate information about the transaction output for future spending
function generateSpendingInfo(txId, outputIndex, outputScript, outputAmount) {
    console.log(`\nOutput Information for Future Spending:`);
    console.log(`TXID: ${txId}`);
    console.log(`Vout: ${outputIndex}`);
    console.log(`Amount: ${outputAmount} sats`);
    console.log(`Script Type: P2TR`);
    console.log(`Internal Key: ${outputScript.slice(2, 34).toString('hex')}`);
}

// Execute the transaction signing
createSignedTransaction()
    .then(result => {
        console.log(`\nTransaction Successfully Signed:`);
        console.log(`Transaction ID: ${result.txId}`);
        console.log(`Address: ${result.address}`);
        console.log(`\nSigned Transaction Hex:`);
        console.log(result.signedTxHex);

        // Generate information for future spending
        generateSpendingInfo(result.txId, 0, outputScript, outputAmount);

        // Print the command to test mempool acceptance
        console.log(`\nTo test mempool acceptance, run this Bitcoin Core command:`);
        console.log(`bitcoin-clitestmempoolaccept '["${result.signedTxHex}"]'`);

        // Print the command to broadcast the transaction
        console.log(`\nTo broadcast the transaction, run:`);
        console.log(`bitcoin-cli sendrawtransaction "${result.signedTxHex}"`);
    })
    .catch(error => {
        console.error('ERROR:', error.message);
    });
