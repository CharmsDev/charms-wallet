/**
 * Per-input PSBT signing primitives.
 *
 * Both signers compute the sighash from the unsigned transaction and set
 * the field directly rather than going through psbt.signInput(), which
 * does an internal pubkey comparison that fails on Taproot key-path
 * spends where the internal key is not the output key.
 */

import * as bitcoin from 'bitcoinjs-lib';
import { ecc } from './ecc.js';

/** Route to the right signer for the key we hold. */
export function signInputByType(psbt, inputIndex, keyInfo, network) {
  if (keyInfo.type === 'p2wpkh') {
    signP2wpkhInput(psbt, inputIndex, keyInfo, network);
  } else {
    signTaprootInput(psbt, inputIndex, keyInfo, network);
  }
}

/**
 * Match an input's scriptPubKey against every key we hold and sign it.
 * Used when the caller did not say which address owns the input.
 *
 * @returns {boolean} true if a key matched and the input was signed
 */
export function matchAndSignInput(psbt, inputIndex, keyMap, network) {
  const inputData = psbt.data.inputs[inputIndex];
  if (!inputData?.witnessUtxo) return false;
  const scriptHex = Buffer.from(inputData.witnessUtxo.script).toString('hex');

  for (const keyInfo of keyMap.values()) {
    try {
      if (keyInfo.type === 'p2wpkh') {
        // scriptPubKey: 0014<20-byte-hash>
        const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: keyInfo.publicKey, network });
        if (p2wpkh.output.toString('hex') === scriptHex) {
          signP2wpkhInput(psbt, inputIndex, keyInfo, network);
          return true;
        }
      } else {
        // scriptPubKey: 5120<32-byte-xonly>
        const p2tr = bitcoin.payments.p2tr({ internalPubkey: keyInfo.xOnlyPubKey, network });
        if (p2tr.output.toString('hex') === scriptHex) {
          signTaprootInput(psbt, inputIndex, keyInfo, network);
          return true;
        }
      }
    } catch { /* not this key */ }
  }
  return false;
}

/**
 * Sign one P2WPKH input with ECDSA (BIP143 witness v0).
 *
 * 1. scriptCode is the P2PKH-style script built from the P2WPKH hash.
 * 2. sighash comes from hashForWitnessV0 on the unsigned transaction.
 * 3. The DER signature goes on the input as partialSig.
 */
export function signP2wpkhInput(psbt, inputIndex, keyInfo, network) {
  const { privateKey, publicKey } = keyInfo;

  const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: publicKey, network });
  const scriptCode = bitcoin.payments.p2pkh({ hash: p2wpkh.hash, network }).output;

  const value = psbt.data.inputs[inputIndex].witnessUtxo.value;

  const tx = psbt.__CACHE.__TX;
  const sighash = tx.hashForWitnessV0(
    inputIndex,
    scriptCode,
    typeof value === 'bigint' ? value : BigInt(value),
    bitcoin.Transaction.SIGHASH_ALL,
  );

  const sig = ecc.sign(sighash, privateKey);
  const derSig = bitcoin.script.signature.encode(Buffer.from(sig), bitcoin.Transaction.SIGHASH_ALL);

  psbt.updateInput(inputIndex, {
    partialSig: [{ pubkey: Buffer.from(publicKey), signature: derSig }],
  });
}

/**
 * Sign one Taproot input with a tweaked private key (BIP341 key path).
 *
 * 1. Negate the private key first if the internal public key has odd Y.
 * 2. tweak = taggedHash('TapTweak', xOnlyPubKey); add it to the key.
 * 3. sighash comes from hashForWitnessV1, which needs the prevout script
 *    and value of every input, not just this one.
 * 4. The Schnorr signature goes on the input as tapKeySig.
 */
export function signTaprootInput(psbt, inputIndex, keyInfo, network) {
  const { privateKey, xOnlyPubKey } = keyInfo;

  if (!psbt.data.inputs[inputIndex].tapInternalKey) {
    psbt.updateInput(inputIndex, { tapInternalKey: xOnlyPubKey });
  }

  const isOddY = keyInfo.publicKey[0] === 0x03;
  const tweakedPrivateKey = ecc.privateAdd(
    isOddY ? ecc.privateNegate(privateKey) : privateKey,
    bitcoin.crypto.taggedHash('TapTweak', xOnlyPubKey),
  );
  if (!tweakedPrivateKey) throw new Error('Tweak resulted in invalid private key');

  // The tweaked key must reproduce the output key in the scriptPubKey, or
  // the signature will be valid maths over the wrong key and the node
  // will reject the transaction with no useful reason.
  const tweakedPub = ecc.pointFromScalar(tweakedPrivateKey);
  const tweakedXOnly = Buffer.from(tweakedPub.slice(1, 33)).toString('hex');
  const scriptPubKey = Buffer.from(psbt.data.inputs[inputIndex].witnessUtxo.script).toString('hex');
  const outputKeyFromScript = scriptPubKey.slice(4); // skip 5120
  if (tweakedXOnly !== outputKeyFromScript) {
    console.error(`[signTaprootInput] input ${inputIndex}: tweaked key does not match the output key, signature will be invalid`);
  }

  // BIP341 commits to every prevout, so collect them all.
  const prevOutScripts = [];
  const values = [];
  for (let i = 0; i < psbt.data.inputs.length; i++) {
    const input = psbt.data.inputs[i];
    if (!input.witnessUtxo) {
      throw new Error(`Input ${i} missing witnessUtxo, cannot compute Taproot sighash`);
    }
    prevOutScripts.push(input.witnessUtxo.script);
    values.push(input.witnessUtxo.value);
  }

  const tx = psbt.__CACHE.__TX;
  const sighashType = psbt.data.inputs[inputIndex].sighashType || bitcoin.Transaction.SIGHASH_DEFAULT;
  const sighash = tx.hashForWitnessV1(inputIndex, prevOutScripts, values, sighashType);

  const sig = Buffer.from(ecc.signSchnorr(sighash, tweakedPrivateKey));

  // A non-default sighash type is appended to the 64-byte signature.
  const tapKeySig = sighashType ? Buffer.concat([sig, Buffer.from([sighashType])]) : sig;
  psbt.data.updateInput(inputIndex, { tapKeySig });
}
