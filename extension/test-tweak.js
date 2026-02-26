/**
 * Test script to verify Taproot key tweaking logic.
 * Run with: node test-tweak.js
 * 
 * This verifies that our tweaking produces a public key matching the P2TR output key.
 */
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { BIP32Factory } from 'bip32';
import * as bip39 from 'bip39';

bitcoin.initEccLib(ecc);
const bip32 = BIP32Factory(ecc);

// Use a test mnemonic (NOT real funds)
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

async function main() {
    const network = bitcoin.networks.bitcoin;
    const seed = await bip39.mnemonicToSeed(TEST_MNEMONIC);
    const root = bip32.fromSeed(seed, network);
    const basePath = "m/86'/0'/0'";
    const accountNode = root.derivePath(basePath);
    const child = accountNode.derive(0).derive(0);

    const privateKey = child.privateKey;
    const publicKey = child.publicKey;
    const xOnlyPubKey = Buffer.from(publicKey.slice(1, 33));

    console.log('Public key prefix:', '0x' + publicKey[0].toString(16));
    console.log('xOnly pubkey:', xOnlyPubKey.toString('hex'));

    // Create P2TR address
    const p2tr = bitcoin.payments.p2tr({ internalPubkey: xOnlyPubKey, network });
    console.log('P2TR address:', p2tr.address);
    console.log('P2TR output (scriptPubKey):', p2tr.output.toString('hex'));
    const outputKeyFromScript = p2tr.output.toString('hex').slice(4); // skip 5120
    console.log('Output key from scriptPubKey:', outputKeyFromScript);

    // Our tweaking logic (from approve-sign.jsx)
    const isOddY = publicKey[0] === 0x03;
    console.log('isOddY:', isOddY);

    const tweak = bitcoin.crypto.taggedHash('TapTweak', xOnlyPubKey);
    const tweakedPrivateKey = ecc.privateAdd(
        isOddY ? ecc.privateNegate(privateKey) : privateKey,
        tweak
    );

    // Derive tweaked public key from tweaked private key
    const tweakedPub = ecc.pointFromScalar(tweakedPrivateKey);
    const tweakedXOnly = Buffer.from(tweakedPub.slice(1, 33)).toString('hex');

    console.log('Tweaked xOnly pubkey:', tweakedXOnly);
    console.log('Output key from script:', outputKeyFromScript);
    console.log('MATCH:', tweakedXOnly === outputKeyFromScript);

    if (tweakedXOnly !== outputKeyFromScript) {
        console.error('❌ MISMATCH! The tweaking logic is WRONG.');
        
        // Try the alternative: check if tweakedPub has even Y
        const tweakedPubPrefix = tweakedPub[0];
        console.log('Tweaked pub prefix:', '0x' + tweakedPubPrefix.toString(16));
        
        // BIP341 says the output key always has even Y
        // If our tweaked key has odd Y, we need to negate
        if (tweakedPubPrefix === 0x03) {
            console.log('Tweaked key has ODD Y - this means the output key is the negation');
            // The x-coordinate should still match since negation only flips Y
            console.log('But x-only should still match...');
        }
    } else {
        console.log('✅ Tweaking logic is CORRECT.');
    }

    // Also test: what does bitcoinjs-lib's internal tweaking produce?
    // p2tr.pubkey is the output key
    console.log('\nbitcoinjs-lib p2tr.pubkey:', p2tr.pubkey ? Buffer.from(p2tr.pubkey).toString('hex') : 'N/A');
    console.log('p2tr.internalPubkey:', p2tr.internalPubkey ? Buffer.from(p2tr.internalPubkey).toString('hex') : 'N/A');
}

main().catch(console.error);
