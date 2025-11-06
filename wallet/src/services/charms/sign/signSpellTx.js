import * as bitcoin from 'bitcoinjs-lib';
import { BIP32Factory } from 'bip32';
import * as bip39 from 'bip39';
import * as ecc from 'tiny-secp256k1';
import { ECPairFactory } from 'ecpair';
import { getSeedPhrase, getAddresses } from '@/services/storage';
import { utxoService } from '@/services/utxo';
import { decodeTx } from '@/utils/txDecoder';
import {
    toXOnly,
    findAddressForUTXO,
    getDerivationPath,
    verifyPrivateKeyForAddress
} from './txUtils';

const ECPair = ECPairFactory(ecc);
const bip32 = BIP32Factory(ecc);

export async function signSpellTransaction(
    spellTxHex,
    commitTxHex,
    seedPhrase,
    network,
    inputSigningMap = null,  // NEW: Map of txid:vout -> addressInfo
    logCallback = () => { }
) {
    console.log('🔐 [signSpellTx] ===== FUNCTION CALLED =====');
    console.log('🔐 [signSpellTx] Parameters received:');
    console.log('  - spellTxHex length:', spellTxHex?.length || 0);
    console.log('  - commitTxHex length:', commitTxHex?.length || 0);
    console.log('  - network:', network);
    console.log('  - inputSigningMap:', inputSigningMap);
    
    // Logging function that only outputs the final transaction ID
    const log = message => {
        if (message.startsWith('Spell transaction signed successfully: TXID')) {
            logCallback(message);
        }
    };
    try {
        console.log('🔐 [signSpellTx] Starting validation...');
        
        if (!spellTxHex) throw new Error('Spell transaction hex is required');
        if (!commitTxHex) throw new Error('Commit transaction hex is required');

        // Decode the commit transaction to extract necessary information
        const decodedCommitTx = decodeTx(commitTxHex);
        const commitTxId = decodedCommitTx.txid;

        // Extract scriptPubKey and amount from the commit transaction output
        const commitTxOutput = decodedCommitTx.outputs[0]; // Assuming the first output is the one we need
        const commitTxScriptPubKey = commitTxOutput.scriptPubKey;
        const commitTxAmount = commitTxOutput.value;

        const spellTx = bitcoin.Transaction.fromBuffer(Buffer.from(spellTxHex, 'hex'), true);
        spellTx.version = 2; // Set version 2 for Taproot compatibility

        // Generate BIP32 root key from seed phrase
        const mnemonic = seedPhrase || await getSeedPhrase();
        if (!mnemonic) throw new Error('Seed phrase not found');
        const seed = await bip39.mnemonicToSeed(mnemonic);
        const bitcoinNetwork = network === 'mainnet' ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
        const root = bip32.fromSeed(seed, bitcoinNetwork);

        const prevOutScripts = [];
        const values = [];
        const signData = {}; // Store tweaked keys by input index

        // Prepare signing data for each input
        for (let i = 0; i < spellTx.ins.length; i++) {
            const rawTxid = Buffer.from(spellTx.ins[i].hash).reverse().toString('hex');
            const vout = spellTx.ins[i].index;
            let utxoValue = null;
            let script = null;

            // Use inputSigningMap if provided, otherwise fallback to findAddressForUTXO
            const utxoKey = `${rawTxid}:${vout}`;
            let addressInfo = null;
            
            console.log(`🔐 [signSpellTx] Processing input ${i}: ${utxoKey}`);
            
            if (inputSigningMap && inputSigningMap[utxoKey]) {
                // Use pre-computed address info from the map
                addressInfo = inputSigningMap[utxoKey];
                console.log(`🔐 [signSpellTx] ✅ Using inputSigningMap for ${utxoKey} -> ${addressInfo.address}`);
            } else {
                // Fallback: search in UTXO store
                console.log(`🔐 [signSpellTx] ⚠️ inputSigningMap not found for ${utxoKey}, using findAddressForUTXO`);
                addressInfo = await findAddressForUTXO(rawTxid, vout, network);
                if (addressInfo) {
                    console.log(`🔐 [signSpellTx] Found via findAddressForUTXO: ${addressInfo.address}`);
                } else {
                    console.log(`🔐 [signSpellTx] ❌ NOT FOUND via findAddressForUTXO`);
                }
            }
            
            if (addressInfo) {
                const path = getDerivationPath(addressInfo, network, 'bitcoin');
                const child = root.derivePath(path);
                let privKey = child.privateKey;
                if (!privKey) throw new Error(`Could not derive private key for ${path}`);
                if (!Buffer.isBuffer(privKey)) privKey = Buffer.from(privKey);

                if (!verifyPrivateKeyForAddress(privKey, addressInfo.address, ECPair, network)) {
                    throw new Error(`Private key does not correspond to address: ${addressInfo.address}`);
                }

                const internalPubkey = toXOnly(child.publicKey);
                const p2tr = bitcoin.payments.p2tr({
                    internalPubkey,
                    network: bitcoinNetwork
                });
                script = p2tr.output;

                // Retrieve UTXO value from storage (with correct network)
                const utxoNetwork = network === 'mainnet' ? 'mainnet' : 'testnet';
                const matchingUtxos = await utxoService.findUtxosByTxid(rawTxid, 'bitcoin', utxoNetwork);
                const matchingUtxo = matchingUtxos.find(utxo => utxo.vout === vout);

                if (!matchingUtxo) {
                    throw new Error(`UTXO value for wallet input ${rawTxid}:${vout} not found`);
                }

                utxoValue = matchingUtxo.value;

                // Apply Taproot tweaking to private key
                const tweak = bitcoin.crypto.taggedHash('TapTweak', internalPubkey);
                const isOddY = child.publicKey[0] === 0x03;
                let keyForTweak = privKey;
                if (isOddY) {
                    const neg = ecc.privateNegate(privKey);
                    if (!neg) throw new Error('Failed to negate private key');
                    keyForTweak = neg;
                }
                const tweakedKey = ecc.privateAdd(keyForTweak, tweak);
                if (!tweakedKey) throw new Error('Tweak resulted in invalid private key');
                signData[i] = { tweakedKey };
            } else if (rawTxid === commitTxId) {
                // Use data from commit transaction
                script = Buffer.from(commitTxScriptPubKey, 'hex');
                utxoValue = commitTxAmount;
            } else {
                throw new Error(`Unknown input UTXO: ${rawTxid}:${vout}`);
            }
            prevOutScripts.push(script);
            values.push(utxoValue);
        }

        // Generate signature hashes for all inputs
        const sighashes = [];
        for (let i = 0; i < spellTx.ins.length; i++) {
            const sighash = spellTx.hashForWitnessV1(
                i,
                prevOutScripts,
                values,
                bitcoin.Transaction.SIGHASH_DEFAULT
            );
            sighashes.push(sighash);
        }

        // Sign each transaction input
        for (let i = 0; i < spellTx.ins.length; i++) {
            const rawTxid = Buffer.from(spellTx.ins[i].hash).reverse().toString('hex');

            if (Object.prototype.hasOwnProperty.call(signData, i)) {
                // Sign wallet-owned input with tweaked key
                const signature = Buffer.from(ecc.signSchnorr(sighashes[i], signData[i].tweakedKey));
                spellTx.ins[i].witness = [signature];
            } else if (rawTxid === commitTxId) {
                // Preserve existing witness data for commit tx input
                const existingWitness = spellTx.ins[i].witness || [];
            }
        }

        const signedTxHex = spellTx.toHex();
        const txidFinal = spellTx.getId();
        log(`Spell transaction signed successfully: TXID ${txidFinal}`);
        return { txid: txidFinal, hex: signedTxHex };
    } catch (error) {
        console.error('🔐 [signSpellTx] ❌ ERROR:', error);
        console.error('🔐 [signSpellTx] Error message:', error.message);
        console.error('🔐 [signSpellTx] Error stack:', error.stack);
        log(`Error signing spell transaction: ${error.message}`);
        throw error;
    }
}
