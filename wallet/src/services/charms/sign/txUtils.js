import * as bitcoin from 'bitcoinjs-lib';
import { getAddresses } from '@/services/storage';
import { utxoService } from '@/services/utxo';

// Decode Bitcoin script to determine type
export function decodeScript(script) {
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

// Extract transaction details from hex format
export function parseUnsignedTx(txHex) {
    const tx = bitcoin.Transaction.fromHex(txHex);

    // Extract input data
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

    // Extract output data
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

// Convert public key to x-only format for Taproot
export function toXOnly(pubkey) {
    return pubkey.length === 33 ? Buffer.from(pubkey.slice(1, 33)) : pubkey;
}

// Identify wallet address associated with a UTXO
export async function findAddressForUTXO(txid, vout) {
    try {
        // Search for UTXOs by transaction ID
        const matchingUtxos = await utxoService.findUtxosByTxid(txid);

        // Find matching output index
        const matchingUtxo = matchingUtxos.find(utxo => utxo.vout === vout);

        if (matchingUtxo && matchingUtxo.address) {
            // Retrieve address metadata
            const addresses = await getAddresses();
            const addressEntry = addresses.find(entry => entry.address === matchingUtxo.address);

            if (addressEntry) {
                return {
                    address: matchingUtxo.address,
                    index: addressEntry.index,
                    isChange: addressEntry.isChange || false
                };
            }

            // Return default values if address not in wallet
            return {
                address: matchingUtxo.address,
                index: 0,
                isChange: false
            };
        }

        return null;
    } catch (error) {
        console.error('Error finding address for UTXO:', error);
        return null;
    }
}

// Generate BIP32 derivation path for address
export function getDerivationPath(addressInfo) {
    // BIP86 purpose for Taproot
    const purpose = "86'";
    // Coin type (mainnet)
    const coinType = "0'";
    // Account index
    const account = "0'";
    // Change or receiving chain
    const change = addressInfo.isChange ? "1" : "0";
    // Address index in chain
    const index = addressInfo.index.toString();

    return `m/${purpose}/${coinType}/${account}/${change}/${index}`;
}

// Validate private key matches expected address
export function verifyPrivateKeyForAddress(privateKey, address, ECPair) {
    try {
        // Generate key pair from private key
        const ecPair = ECPair.fromPrivateKey(privateKey, { network: bitcoin.networks.testnet });

        // Extract public key
        const publicKey = ecPair.publicKey;

        // Convert to Taproot format
        const xOnlyPubkey = toXOnly(publicKey);

        // Create P2TR payment
        const p2tr = bitcoin.payments.p2tr({
            internalPubkey: xOnlyPubkey,
            network: bitcoin.networks.testnet
        });

        // Generate address from payment
        const derivedAddress = p2tr.address;

        console.log('Derived address from private key:', derivedAddress);
        console.log('Expected address:', address);

        // Compare addresses
        return derivedAddress === address;
    } catch (error) {
        console.error('Error verifying private key:', error);
        return false;
    }
}
