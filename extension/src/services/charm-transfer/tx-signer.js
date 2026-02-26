/**
 * Transaction Signer for Charm Transfers
 *
 * Signs the spell TX returned by the prover.
 * The prover returns a raw TX where our input(s) need a Taproot Schnorr signature.
 *
 * Uses the same BIP86 key derivation as approve-sign.jsx.
 */

import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { BIP32Factory } from 'bip32';
import * as bip39 from 'bip39';

bitcoin.initEccLib(ecc);
const bip32 = BIP32Factory(ecc);

const MAINNET = bitcoin.networks.bitcoin;
const TESTNET = {
  messagePrefix: '\x18Bitcoin Signed Message:\n',
  bech32: 'tb',
  bip32: { public: 0x043587cf, private: 0x04358394 },
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  wif: 0xef,
};

function getNetwork(networkName) {
  return networkName === 'mainnet' ? MAINNET : TESTNET;
}

function getDerivationPath(networkName) {
  return networkName === 'mainnet' ? "m/86'/0'/0'" : "m/86'/1'/0'";
}

/**
 * Tagged hash for Taproot tweak (BIP340/BIP341)
 */
function taggedHash(tag, data) {
  const { createHash } = globalThis.crypto
    ? { createHash: null }
    : require('crypto');

  // Use noble/hashes via ecc or implement inline
  // We'll use the bitcoinjs-lib crypto module
  const tagBytes = new TextEncoder().encode(tag);
  const tagHash = bitcoin.crypto.sha256(Buffer.from(tagBytes));
  const preimage = Buffer.concat([tagHash, tagHash, Buffer.from(data)]);
  return bitcoin.crypto.sha256(preimage);
}

/**
 * Derive private key for a P2TR address using BIP86.
 * Returns { privateKey, tweakedPrivateKey, publicKey }
 */
async function deriveKeyForAddress(seedPhrase, networkName, addressIndex, isChange = false) {
  const network = getNetwork(networkName);
  const seed = await bip39.mnemonicToSeed(seedPhrase);
  const root = bip32.fromSeed(seed, network);
  const path = `${getDerivationPath(networkName)}/${isChange ? 1 : 0}/${addressIndex}`;
  const child = root.derivePath(path);

  if (!child.privateKey) throw new Error('No private key derived');

  const xOnlyPubKey = child.publicKey.slice(1, 33);

  // Taproot tweak: privKey + taggedHash('TapTweak', xOnlyPubKey)
  const tweak = taggedHash('TapTweak', xOnlyPubKey);
  let tweakedPrivKey = Buffer.from(child.privateKey);

  // If pubkey has odd Y, negate the private key first
  if (child.publicKey[0] === 3) {
    tweakedPrivKey = Buffer.from(ecc.privateNegate(tweakedPrivKey));
  }

  const tweaked = ecc.privateAdd(tweakedPrivKey, tweak);
  if (!tweaked) throw new Error('Taproot tweak failed');

  return {
    privateKey: Buffer.from(child.privateKey),
    tweakedPrivateKey: Buffer.from(tweaked),
    publicKey: child.publicKey,
    xOnlyPubKey,
  };
}

/**
 * Find which spell TX input(s) belong to a given address by scanning prevTxs.
 * Returns array of { inputIndex, value, scriptPubKey }
 */
function findInputsForAddress(spellTx, prevTxMap, address, network) {
  const tx = bitcoin.Transaction.fromHex(spellTx);
  const results = [];

  for (let i = 0; i < tx.ins.length; i++) {
    const inp = tx.ins[i];
    const prevTxid = Buffer.from(inp.hash).reverse().toString('hex');
    const prevTxHex = prevTxMap.get(prevTxid);
    if (!prevTxHex) continue;

    const prevTx = bitcoin.Transaction.fromHex(prevTxHex);
    const prevOut = prevTx.outs[inp.index];
    if (!prevOut) continue;

    // Derive address from scriptPubKey to check if it's ours
    try {
      const derived = bitcoin.address.fromOutputScript(prevOut.script, network);
      if (derived === address) {
        results.push({
          inputIndex: i,
          value: prevOut.value,
          scriptPubKey: prevOut.script,
        });
      }
    } catch (_) {
      // Non-standard script — not ours
    }
  }

  return results;
}

/**
 * Sign a spell TX raw hex using BIP86 Taproot key from seed phrase.
 *
 * @param {string} spellTxHex    Raw TX hex from prover
 * @param {Map<string,string>} prevTxMap  txid → raw hex (for all inputs)
 * @param {string} signerAddress  Our P2TR address that owns the input(s)
 * @param {number} addressIndex   BIP86 derivation index
 * @param {boolean} isChange      BIP86 change path flag
 * @param {string} seedPhrase
 * @param {string} networkName   'mainnet' | 'testnet4'
 * @returns {string} signed raw TX hex
 */
export async function signSpellTx(
  spellTxHex,
  prevTxMap,
  signerAddress,
  addressIndex,
  isChange,
  seedPhrase,
  networkName,
) {
  const network = getNetwork(networkName);
  const { tweakedPrivateKey } = await deriveKeyForAddress(
    seedPhrase, networkName, addressIndex, isChange
  );

  const tx = bitcoin.Transaction.fromHex(spellTxHex);
  const ourInputs = findInputsForAddress(spellTxHex, prevTxMap, signerAddress, network);

  if (ourInputs.length === 0) {
    throw new Error(`No inputs found for address ${signerAddress} in spell TX`);
  }

  // Sign each of our inputs with Taproot key-path spend
  for (const { inputIndex, value, scriptPubKey } of ourInputs) {
    const sighash = tx.hashForWitnessV1(
      inputIndex,
      // All prevout scripts
      tx.ins.map((inp) => {
        const pTxHex = prevTxMap.get(Buffer.from(inp.hash).reverse().toString('hex'));
        if (!pTxHex) throw new Error(`Missing prevTx for input ${inputIndex}`);
        const pTx = bitcoin.Transaction.fromHex(pTxHex);
        return pTx.outs[inp.index].script;
      }),
      // All prevout values
      tx.ins.map((inp) => {
        const pTxHex = prevTxMap.get(Buffer.from(inp.hash).reverse().toString('hex'));
        if (!pTxHex) throw new Error(`Missing prevTx for input ${inputIndex}`);
        const pTx = bitcoin.Transaction.fromHex(pTxHex);
        return pTx.outs[inp.index].value;
      }),
      bitcoin.Transaction.SIGHASH_DEFAULT,
    );

    const sig = ecc.signSchnorr(sighash, tweakedPrivateKey, Buffer.alloc(32));
    tx.ins[inputIndex].witness = [Buffer.from(sig)];
  }

  return tx.toHex();
}
