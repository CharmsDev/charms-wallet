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

function getBip86Path(networkName) {
  return networkName === 'mainnet' ? "m/86'/0'/0'" : "m/86'/1'/0'";
}

function getBip84Path(networkName) {
  return networkName === 'mainnet' ? "m/84'/0'/0'" : "m/84'/1'/0'";
}

function isP2wpkhScript(script) {
  return script.length === 22 && script[0] === 0x00 && script[1] === 0x14;
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
 * Derive private key for an address.
 *
 * @param {string} addressType  'p2tr' (default) or 'p2wpkh'
 * @returns For P2TR: { privateKey, tweakedPrivateKey, publicKey, xOnlyPubKey, type: 'p2tr' }
 *          For P2WPKH: { privateKey, publicKey, type: 'p2wpkh' }
 */
async function deriveKeyForAddress(seedPhrase, networkName, addressIndex, isChange = false, addressType = 'p2tr') {
  const network = getNetwork(networkName);
  const seed = await bip39.mnemonicToSeed(seedPhrase);
  const root = bip32.fromSeed(seed, network);

  if (addressType === 'p2wpkh') {
    // BIP84 — raw private key, no tweak
    const path = `${getBip84Path(networkName)}/${isChange ? 1 : 0}/${addressIndex}`;
    const child = root.derivePath(path);
    if (!child.privateKey) throw new Error('No private key derived');
    return {
      privateKey: Buffer.from(child.privateKey),
      publicKey: child.publicKey,
      type: 'p2wpkh',
    };
  }

  // BIP86 P2TR
  const path = `${getBip86Path(networkName)}/${isChange ? 1 : 0}/${addressIndex}`;
  const child = root.derivePath(path);
  if (!child.privateKey) throw new Error('No private key derived');

  const xOnlyPubKey = child.publicKey.slice(1, 33);
  const tweak = taggedHash('TapTweak', xOnlyPubKey);
  let tweakedPrivKey = Buffer.from(child.privateKey);
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
    type: 'p2tr',
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

  // Derive keys per unique (type, index, isChange) — cache to avoid re-deriving
  const keyCache = new Map();

  // Detect address type from prevout script
  function detectType(script) {
    return isP2wpkhScript(script) ? 'p2wpkh' : 'p2tr';
  }

  let signedCount = 0;
  for (let i = 0; i < tx.ins.length; i++) {
    const inp = tx.ins[i];
    const prevTxid = Buffer.from(inp.hash).reverse().toString('hex');
    const utxoKey = `${prevTxid}:${inp.index}`;
    const addrType = detectType(prevoutScripts[i]);

    const signingInfo = inputSigningMap[utxoKey];
    if (!signingInfo) {
      // Try matching by address from prevout
      const prevAddr = tryDeriveAddress(prevoutScripts[i], network);
      if (prevAddr) {
        const matchEntry = Object.values(inputSigningMap).find(e => e.address === prevAddr);
        if (matchEntry) {
          const key = await getCachedKey(keyCache, matchEntry.index, matchEntry.isChange, seedPhrase, networkName, addrType);
          signInput(tx, i, prevoutScripts, prevoutValues, key);
          signedCount++;
          continue;
        }
      }
      continue;
    }

    const key = await getCachedKey(keyCache, signingInfo.index, signingInfo.isChange, seedPhrase, networkName, addrType);
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

async function getCachedKey(cache, index, isChange, seedPhrase, networkName, addressType = 'p2tr') {
  const cacheKey = `${addressType}:${index}:${isChange}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const keyInfo = await deriveKeyForAddress(seedPhrase, networkName, index, isChange, addressType);
  cache.set(cacheKey, keyInfo);
  return keyInfo;
}

function signInput(tx, inputIndex, prevoutScripts, prevoutValues, keyInfo) {
  const script = prevoutScripts[inputIndex];

  if (isP2wpkhScript(script)) {
    // P2WPKH: ECDSA signing with raw private key
    const pubkey = keyInfo.publicKey;
    const p2wpkh = bitcoin.payments.p2wpkh({ pubkey, network: null }); // network not needed for hash
    const scriptCode = bitcoin.payments.p2pkh({ hash: p2wpkh.hash }).output;
    const value = prevoutValues[inputIndex];
    const sighash = tx.hashForWitnessV0(
      inputIndex,
      scriptCode,
      typeof value === 'bigint' ? value : BigInt(value),
      bitcoin.Transaction.SIGHASH_ALL,
    );
    const sig = ecc.sign(sighash, keyInfo.privateKey);
    const derSig = bitcoin.script.signature.encode(Buffer.from(sig), bitcoin.Transaction.SIGHASH_ALL);
    tx.ins[inputIndex].witness = [derSig, Buffer.from(pubkey)];
  } else {
    // P2TR: Schnorr signing with tweaked private key
    const sighash = tx.hashForWitnessV1(
      inputIndex,
      prevoutScripts,
      prevoutValues,
      bitcoin.Transaction.SIGHASH_DEFAULT,
    );
    const sig = ecc.signSchnorr(sighash, keyInfo.tweakedPrivateKey, Buffer.alloc(32));
    tx.ins[inputIndex].witness = [Buffer.from(sig)];
  }
}
