import * as bitcoin from 'bitcoinjs-lib';
import { getAddresses } from '@/services/storage';
import { utxoService } from '@/services/utxo';


// Transaction hex constants for testing
export const COMMIT_UNSIGNED_TX_HEX = "0200000001dcc81deec3bce3c88fa77471eaa89e5d4c4f655d5c1a49b4e2af7c07c0280c0c0100000000ffffffff01b22e0100000000002251205420a0860b0aadc7c686d6f574978851c9238265e978bcf75641930d11d3341800000000";
export const SPELL_UNSIGNED_TX_HEX = "020000000001022ba90cb088a7e420c962053bc04c089821e73e648340cf7c1a381bece90135cd0000000000ffffffff3c913e844096900d40ab8fa20cf0fd88f9c8d5c72868da945fe85c79744d8f130000000000ffffffff03e80300000000000022512051f7d143da31352a9bf4a771ace9f06b4d478329b8733f27b1f47a1abedba4aa651f000000000000225120ff9f32061f3d77df48351293ee8d5c9bb39730004edef0abfdf1c2484ff1b503c40b010000000000225120f81f783ed9457b8433a97aac5bba0408fd3dd78f93bc3da74783ffbb4c35006f0003413fa1cb4dc5a5d80681827441f0375bf7590b7be2fb3ac03b0da19910133fa850459f7abad09f4c0139f5d0ec7cd90680e5e3f41f55819c87ed559ef375ea341a81fdf1020063057370656c6c4d080282a36776657273696f6e02627478a2647265667380646f75747381a100a2667469636b657269434841524d532d31336972656d61696e696e671a000186a0716170705f7075626c69635f696e70757473a183616e982010183118cf18cd1854188b1853182c184218b318e718cf189118ee18dc189418c118ce183f183a0618ad1418621823182b181c1878186718c318dc18cc982018d3189b1828184c18a618bd18a1184918e218ef18f81873186b18f818a31845183c18df18f1183f183718cc183614181818ae1857182a188b071823185ff69901041118b618a0189d0c18a41884181f183f188518ed18eb189a0b1871183b01184418a4187818c41845182418b3183e001884189318ea18d8184a0c183418fa18221850182d18e71828182218f41862186918a9187118a9189618bb182818de18bc187418c518ac18f3181e1318ec189b189f1854184a183c181c18f8186c1862183a1821091863189418bd1826184918db18201618221875186d189818e818df18741861181f18191839186518951857186b181e183d18d618c3183818831891182018cc188c18e01880182d1858187c11184718b2186b189118bc18a218ca183518670418ad184b18e618fc1518ce1857185b18f0189418d818b8186c0718a11848186e0418ca18231857182f18ff18b311187d18e80a1867186818ae187d184d18d518e118fe188718f418c2188418bb184cb9d6189018e918a0181b18a218410718f00518eb0f185211181c186718c6186c18c0183d181a189a188318f7182218a7185e18a20e18b0185318b9181e189218eb18de182e189218f818591618eb187e18fe061891189f1835183818701846188f18f1187d183218b618ad182718e00f182518bc0f18de188f18b118d018330518d1184e189518a118fd18e2189918fe14189718d018fd18a718b4187418401850189d0a1860184d18ef1888184318a916187e011839188b183768209f5d6d75b7c79335854212fc0fb8421149766a993e2fcb474e9620a0e3def3a2ac21c09f5d6d75b7c79335854212fc0fb8421149766a993e2fcb474e9620a0e3def3a200000000";

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
