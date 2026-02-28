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
 * Sign a spell TX with multiple derivation keys.
 *
 * Each wallet input may be at a different address/derivation path.
 * The prover may also add inputs not in our map (e.g. extra funding from change_address
 * looked up on-chain) — we discover those by scanning prevouts for known wallet addresses.
 *
 * @param {string} spellTxHex        Raw TX hex from prover
 * @param {Map<string,string>} prevTxMap  txid → raw hex
 * @param {Object} inputSigningMap   { "txid:vout": { address, index, isChange } }
 * @param {string} seedPhrase
 * @param {string} networkName       'mainnet' | 'testnet4'
 * @returns {string} signed raw TX hex
 */
export async function signSpellTxMultiKey(
  spellTxHex,
  prevTxMap,
  inputSigningMap,
  seedPhrase,
  networkName,
) {
  const network = getNetwork(networkName);
  const tx = bitcoin.Transaction.fromHex(spellTxHex);

  // Pre-compute all prevout scripts and values (needed for Taproot sighash)
  const prevoutScripts = [];
  const prevoutValues = [];
  for (const inp of tx.ins) {
    const prevTxid = Buffer.from(inp.hash).reverse().toString('hex');
    const prevTxHex = prevTxMap.get(prevTxid);
    if (!prevTxHex) throw new Error(`Missing prevTx for ${prevTxid}`);
    const prevTx = bitcoin.Transaction.fromHex(prevTxHex);
    const prevOut = prevTx.outs[inp.index];
    if (!prevOut) throw new Error(`Missing prevout ${prevTxid}:${inp.index}`);
    prevoutScripts.push(prevOut.script);
    prevoutValues.push(prevOut.value);
  }

  // Derive keys per unique (index, isChange) pair — cache to avoid re-deriving
  const keyCache = new Map(); // "index:isChange" → tweakedPrivateKey

  // Build lookup: for each TX input, find its signing info from the map
  // The map uses utxoId format "txid:vout" as keys
  let signedCount = 0;
  for (let i = 0; i < tx.ins.length; i++) {
    const inp = tx.ins[i];
    const prevTxid = Buffer.from(inp.hash).reverse().toString('hex');
    const utxoKey = `${prevTxid}:${inp.index}`;

    const signingInfo = inputSigningMap[utxoKey];
    if (!signingInfo) {
      // Not our input (e.g. another party's, or prover-added that we don't own)
      // The prover adds inputs from change_address — which should be in our map.
      // If not found, try matching by address from prevout.
      const prevAddr = tryDeriveAddress(prevoutScripts[i], network);
      if (prevAddr) {
        // Search the map for any entry with this address
        const matchEntry = Object.values(inputSigningMap).find(e => e.address === prevAddr);
        if (matchEntry) {
          // Found — sign with this key
          const key = await getCachedKey(keyCache, matchEntry.index, matchEntry.isChange, seedPhrase, networkName);
          signInput(tx, i, prevoutScripts, prevoutValues, key);
          signedCount++;
          continue;
        }
      }
      continue; // truly not ours
    }

    const key = await getCachedKey(keyCache, signingInfo.index, signingInfo.isChange, seedPhrase, networkName);
    signInput(tx, i, prevoutScripts, prevoutValues, key);
    signedCount++;
  }

  if (signedCount === 0) {
    throw new Error('No inputs were signed — inputSigningMap has no matching entries');
  }

  return tx.toHex();
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function tryDeriveAddress(script, network) {
  try {
    return bitcoin.address.fromOutputScript(script, network);
  } catch (_) {
    return null;
  }
}

async function getCachedKey(cache, index, isChange, seedPhrase, networkName) {
  const cacheKey = `${index}:${isChange}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const { tweakedPrivateKey } = await deriveKeyForAddress(seedPhrase, networkName, index, isChange);
  cache.set(cacheKey, tweakedPrivateKey);
  return tweakedPrivateKey;
}

function signInput(tx, inputIndex, prevoutScripts, prevoutValues, tweakedPrivateKey) {
  const sighash = tx.hashForWitnessV1(
    inputIndex,
    prevoutScripts,
    prevoutValues,
    bitcoin.Transaction.SIGHASH_DEFAULT,
  );
  const sig = ecc.signSchnorr(sighash, tweakedPrivateKey, Buffer.alloc(32));
  tx.ins[inputIndex].witness = [Buffer.from(sig)];
}
