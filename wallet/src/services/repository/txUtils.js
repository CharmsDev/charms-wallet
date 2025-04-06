import * as bitcoin from 'bitcoinjs-lib';
import { getUTXOs, getAddresses } from '@/services/storage';

// Default transaction hex values for testing
export const DEFAULT_UNSIGNED_TX_HEX = "0200000001d1ee31ec2d76d11420b3638ec35443d68fa7e3e8a6ffdabf34db6ce5ec6eb3640100000000ffffffff01ba450000000000002251202affa192d6c8f483d0eb153d3247097a2cc71b575dda6f51a5693c91d82b395f00000000";

// Default spell transaction hex for testing
export const DEFAULT_SPELL_TX_HEX = "020000000001020ddd5a3398029480e3b88cb5a6a305a13b03093c90fa33af531bed2ebe507a500000000000ffffffff0b7e0eb4684261077e0fb5c0557a60cc9ce5415f9a14483e8850587035b7eca00000000000ffffffff03e8030000000000002251206eb2ec4ab68e29176884e783dfd93bc42b9310f5ae47a202d0978988cebe1f875b1f000000000000225120ff9f32061f3d77df48351293ee8d5c9bb39730004edef0abfdf1c2484ff1b503d8220000000000002251206eb2ec4ab68e29176884e783dfd93bc42b9310f5ae47a202d0978988cebe1f87000341d57d7d48e214333c18bf10e0266217acf7422f0701e8c5978ae8d5fe0497ae98792db3f53d024bc1490362c0590a6ffed1e87c5c1acb9a148dd66f7067f0939881fdee020063057370656c6c4d080282a36776657273696f6e02627478a2647265667380646f75747381a100a2667469636b657268434841524d532d376972656d61696e696e671a000186a0716170705f7075626c69635f696e70757473a183616e982018c21837185318950c18dc0218c418f7184118c918a718e118f518d7181918a51843188c18cd185a18930c184b1867182418ae18ec18550b183b189398201835189300183218d718b818ac131880189f18df1858182d188718df1851185418bc183a185a182018dd18990218421827188b1618ef1839183110f69901041118b618a0189d18231865188718f11835183318b4186103188f18c5182218441871185218c1181e18a3187418e018f31855181d18af18fd1718751896181f188218b6189e1826183418c5183818f818c018a40313188018ee182518ab184518fd186618b9184618b70b184f18e30d18d10e182118ce18fb187a18cc18de182f0618d7182218bc18e5182d18d4183518aa18d718bc18aa1839186c18cf187518dd18cb186018f8187318a118cc18ba1868181f189318c503187018d0182206181d182018cd18531890189a184c18ac187b0814183018c218d318ab18f118cf18bc0b18b81851183f182918f31838186618a918ff18e518441318240a18bb18f9187418961895000118f9182c186618c6184618ee184d182f186b1895183018d9187f18f1181a1843187418271842189b18a518a3187e4cb6181c183818671855185c18851894188a18e90918f11868182d0018a318f9186a18cd18eb1618331418c11899182c18e2187218b9183518de186d186407189918d2181f18dd0718da187418b31870185918ea1866188f18980a0918cc182318e418d818d218b918fc1845184218a4186118e018b318c818c2181b18d118f407188318c818be184718ec188518cf187b18d2185918df184a18e81893181f18dc18d0186f188c185a18df18c518e218a418c6184518f10a68209313b99a1b0f7dc1b5a0d24d3ff2de77ada54de53c7b95c7b9c3eb86ddce5a60ac21c19313b99a1b0f7dc1b5a0d24d3ff2de77ada54de53c7b95c7b9c3eb86ddce5a6000000000";

/** Helper function to decode script */
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

/** Parse the unsigned transaction to extract all necessary information */
export function parseUnsignedTx(txHex) {
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

/** Convert a public key to x-only format (for Taproot) */
export function toXOnly(pubkey) {
    return pubkey.length === 33 ? Buffer.from(pubkey.slice(1, 33)) : pubkey;
}

/** Find the address that owns a specific UTXO */
export async function findAddressForUTXO(txid, vout) {
    try {
        // Get all UTXOs from localStorage
        const utxoMap = await getUTXOs();

        // Search through all addresses and their UTXOs
        for (const [address, utxos] of Object.entries(utxoMap)) {
            // Find the UTXO that matches txid and vout
            const matchingUtxo = utxos.find(utxo =>
                utxo.txid === txid && utxo.vout === vout
            );

            if (matchingUtxo) {
                // Get address details from localStorage
                const addresses = await getAddresses();
                const addressEntry = addresses.find(entry => entry.address === address);

                if (addressEntry) {
                    return {
                        address,
                        index: addressEntry.index,
                        isChange: addressEntry.isChange || false
                    };
                }

                // If we found the UTXO but not the address details, return basic info
                return { address, index: 0, isChange: false };
            }
        }

        return null;
    } catch (error) {
        console.error('Error finding address for UTXO:', error);
        return null;
    }
}

/** Get derivation path for an address */
export function getDerivationPath(addressInfo) {
    // For Taproot addresses
    const purpose = "86'";
    // Use mainnet (0') for this example
    const coinType = "0'";
    // Account index (usually 0')
    const account = "0'";
    // Change (0 for receiving, 1 for change)
    const change = addressInfo.isChange ? "1" : "0";
    // Address index
    const index = addressInfo.index.toString();

    return `m/${purpose}/${coinType}/${account}/${change}/${index}`;
}

/** Verify if a private key corresponds to a given address */
export function verifyPrivateKeyForAddress(privateKey, address, ECPair) {
    try {
        // Create a keypair from the private key
        const ecPair = ECPair.fromPrivateKey(privateKey, { network: bitcoin.networks.testnet });

        // Get the public key
        const publicKey = ecPair.publicKey;

        // Convert to x-only format for Taproot
        const xOnlyPubkey = toXOnly(publicKey);

        // Create a P2TR payment object
        const p2tr = bitcoin.payments.p2tr({
            internalPubkey: xOnlyPubkey,
            network: bitcoin.networks.testnet
        });

        // Get the address from the payment object
        const derivedAddress = p2tr.address;

        console.log('Derived address from private key:', derivedAddress);
        console.log('Expected address:', address);

        // Check if the derived address matches the expected address
        return derivedAddress === address;
    } catch (error) {
        console.error('Error verifying private key:', error);
        return false;
    }
}
