import * as bitcoin from 'bitcoinjs-lib';
import { BIP32Factory } from 'bip32';
import * as bip39 from 'bip39';
import * as ecc from 'tiny-secp256k1';
import { ECPairFactory } from 'ecpair';
import { getSeedPhrase } from '@/services/storage';
import { utxoService } from '@/services/utxo';
import {
    parseUnsignedTx,
    toXOnly,
    findAddressForUTXO,
    getDerivationPath,
    verifyPrivateKeyForAddress
} from './txUtils';

const ECPair = ECPairFactory(ecc);
const bip32 = BIP32Factory(ecc);

// Signs a Bitcoin Taproot (P2TR) transaction with derived keys
export async function signCommitTransaction(unsignedTxHex, network, inputSigningMap = null, logCallback) {
    console.log('🔐 [signCommitTx] ===== FUNCTION CALLED =====');
    console.log('🔐 [signCommitTx] inputSigningMap:', inputSigningMap);

    // Initialize transaction
    if (!unsignedTxHex) {
        throw new Error('Commit transaction hex is required');
    }

    // Parse unsigned transaction to extract UTXO details
    const txDetails = parseUnsignedTx(unsignedTxHex);

    // Set up logging function
    const log = message => logCallback ? logCallback(message) : null;

    // Determine Bitcoin network
    const bitcoinNetwork = network === 'mainnet' ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;

    try {
        // Identify UTXO address
        const { utxoTxId: inputTxid, utxoVout: inputVout, utxoSequence } = txDetails;
        
        console.log(`🔐 [signCommitTx] Processing funding UTXO: ${inputTxid}:${inputVout}`);

        // Use inputSigningMap if provided, otherwise fallback to findAddressForUTXO
        const utxoKey = `${inputTxid}:${inputVout}`;
        let addressInfo = null;
        
        if (inputSigningMap && inputSigningMap[utxoKey]) {
            addressInfo = inputSigningMap[utxoKey];
            console.log(`🔐 [signCommitTx] ✅ Using inputSigningMap for ${utxoKey} -> ${addressInfo.address}`);
        } else {
            console.log(`🔐 [signCommitTx] ⚠️ inputSigningMap not found for ${utxoKey}, using findAddressForUTXO`);
            addressInfo = await findAddressForUTXO(inputTxid, inputVout, network);
        }
        
        if (!addressInfo)
            throw new Error(`Could not find address for UTXO: ${inputTxid}:${inputVout}`);

        // Derive private key
        const path = getDerivationPath(addressInfo, network, 'bitcoin');

        // Get seed phrase from secure storage
        const seedPhrase = await getSeedPhrase();
        if (!seedPhrase) throw new Error('Seed phrase not found in storage');

        // Convert mnemonic to seed buffer
        const seed = await bip39.mnemonicToSeed(seedPhrase);

        // Generate BIP32 root key
        const root = bip32.fromSeed(seed, bitcoinNetwork);

        // Derive child key from path
        const child = root.derivePath(path);
        const privateKey = child.privateKey;
        if (!privateKey)
            throw new Error(`Could not derive private key for path: ${path}`);

        // Verify key corresponds to address
        if (!verifyPrivateKeyForAddress(privateKey, addressInfo.address, ECPair, network))
            throw new Error(`Private key does not correspond to address: ${addressInfo.address}`);

        // Apply Taproot tweaking
        // Extract X-only public key
        const internalPubkey = toXOnly(child.publicKey);

        // Calculate Taproot tweak hash
        const tweak = bitcoin.crypto.taggedHash('TapTweak', internalPubkey);

        // Apply tweak to private key
        // Validate public key format (compressed SEC)
        if (child.publicKey.length !== 33 || (child.publicKey[0] !== 0x02 && child.publicKey[0] !== 0x03)) {
            throw new Error('Invalid public key format (expected compressed SEC)');
        }
        const isOddY = child.publicKey[0] === 0x03;
        const tweakedPrivateKey = ecc.privateAdd(
            isOddY ? ecc.privateNegate(privateKey) : privateKey,
            tweak
        );
        if (!tweakedPrivateKey)
            throw new Error('Tweak resulted in invalid private key');

        // Create P2TR payment object
        // Initialize P2TR with internal pubkey
        const p2tr = bitcoin.payments.p2tr({
            internalPubkey,
            network: bitcoinNetwork
        });

        // Get UTXO value (with correct network)
        const utxoNetwork = network === 'mainnet' ? 'mainnet' : 'testnet';
        const matchingUtxos = await utxoService.findUtxosByTxid(inputTxid, 'bitcoin', utxoNetwork);
        const matchingUtxo = matchingUtxos.find(utxo => utxo.vout === inputVout);

        if (!matchingUtxo)
            throw new Error('UTXO value not found');

        const utxoValue = matchingUtxo.value;

        // Prepare transaction
        // Parse transaction from hex
        const tx = bitcoin.Transaction.fromHex(unsignedTxHex);

        // Set version 2 for Taproot compatibility
        tx.version = 2;

        // Generate signature hash
        // Compute Taproot sighash for input
        const sighash = tx.hashForWitnessV1(
            0,                  // Input index
            [p2tr.output],      // Previous output script
            [utxoValue],        // Previous output value
            bitcoin.Transaction.SIGHASH_DEFAULT  // Sighash type (0)
        );

        // Create signature
        // Sign with Schnorr signature scheme
        const sig = ecc.signSchnorr(sighash, tweakedPrivateKey);
        const signature = Buffer.from(sig);

        // Attach signature as witness data
        tx.ins[0].witness = [signature];

        // Log transaction details
        log('Transaction signed successfully:');
        log(`- TXID: ${tx.getId()}`);
        log(`- Input: ${inputTxid}:${inputVout}`);
        log(`- Output amount: ${txDetails.outputAmount} sats`);
        log(`- Address: ${addressInfo.address}`);

        // Return transaction data
        return {
            txid: tx.getId(),
            signedTxHex: tx.toHex()
        };
    } catch (error) {
        // Handle errors
        // Log and propagate error
        throw error;
    }
}
