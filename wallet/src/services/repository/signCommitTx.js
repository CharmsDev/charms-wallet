import * as bitcoin from 'bitcoinjs-lib';
import { BIP32Factory } from 'bip32';
import * as bip39 from 'bip39';
import * as ecc from 'tiny-secp256k1';
import { ECPairFactory } from 'ecpair';
import { getSeedPhrase } from '@/services/storage';
import { getUTXOs } from '@/services/storage';
import {
    parseUnsignedTx,
    DEFAULT_UNSIGNED_TX_HEX,
    toXOnly,
    findAddressForUTXO,
    getDerivationPath,
    verifyPrivateKeyForAddress
} from './txUtils';

const ECPair = ECPairFactory(ecc);
const bip32 = BIP32Factory(ecc);

export async function signCommitTransaction(unsignedTxHex, logCallback) {
    if (!unsignedTxHex) unsignedTxHex = DEFAULT_UNSIGNED_TX_HEX;
    const txDetails = parseUnsignedTx(unsignedTxHex);
    const log = message => logCallback ? logCallback(message) : console.log(message);
    try {
        const { utxoTxId: inputTxid, utxoVout: inputVout, utxoSequence } = txDetails;
        const addressInfo = await findAddressForUTXO(inputTxid, inputVout);
        if (!addressInfo)
            throw new Error(`Could not find address for UTXO: ${inputTxid}:${inputVout}`);

        const path = getDerivationPath(addressInfo);
        const seedPhrase = await getSeedPhrase();
        if (!seedPhrase) throw new Error('Seed phrase not found in storage');
        const seed = await bip39.mnemonicToSeed(seedPhrase);
        const root = bip32.fromSeed(seed, bitcoin.networks.testnet);
        const child = root.derivePath(path);
        const privateKey = child.privateKey;
        if (!privateKey)
            throw new Error(`Could not derive private key for path: ${path}`);
        if (!verifyPrivateKeyForAddress(privateKey, addressInfo.address, ECPair))
            throw new Error(`Private key does not correspond to address: ${addressInfo.address}`);

        const internalPubkey = toXOnly(child.publicKey);
        // Compute the tap tweak: for key-path spend with no scripts the tweak is
        // taggedHash("TapTweak", internalPubkey)
        const tweak = bitcoin.crypto.taggedHash('TapTweak', internalPubkey);
        const tweakedPrivateKey = ecc.privateAdd(privateKey, tweak);
        if (!tweakedPrivateKey)
            throw new Error('Tweak resulted in invalid private key');

        // p2tr payment uses the internal pubkey (untweaked) to compute the output script.
        const p2tr = bitcoin.payments.p2tr({
            internalPubkey,
            network: bitcoin.networks.testnet
        });

        let utxoValue = null;
        const utxoMap = await getUTXOs();
        for (const utxos of Object.values(utxoMap)) {
            const utxo = utxos.find(u => u.txid === inputTxid && u.vout === inputVout);
            if (utxo) {
                utxoValue = utxo.value;
                break;
            }
        }
        if (utxoValue === null)
            throw new Error('UTXO value not found');

        // Parse the unsigned TX from hex and force version 2.
        const tx = bitcoin.Transaction.fromHex(unsignedTxHex);
        tx.version = 2;

        // Compute the taproot sighash using SIGHASH_DEFAULT (0)
        const sighash = tx.hashForWitnessV1(
            0,
            [p2tr.output],
            [utxoValue],
            bitcoin.Transaction.SIGHASH_DEFAULT
        );
        const sig = ecc.signSchnorr(sighash, tweakedPrivateKey);
        const signature = Buffer.from(sig);

        tx.ins[0].witness = [signature];

        log('Transaction signed successfully:');
        log(`- TXID: ${tx.getId()}`);
        log(`- Input: ${inputTxid}:${inputVout}`);
        log(`- Output amount: ${txDetails.outputAmount} sats`);
        log(`- Address: ${addressInfo.address}`);

        return {
            txid: tx.getId(),
            signedTxHex: tx.toHex()
        };
    } catch (error) {
        console.error('Signing error:', error);
        throw error;
    }
}