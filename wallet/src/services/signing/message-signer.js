/**
 * Bitcoin Signed Message (BIP137 / Electrum-compatible).
 *
 * The digest is dSHA256 over varint-prefixed "Bitcoin Signed Message:\n"
 * followed by the varint-prefixed message. The header byte in front of
 * the 64-byte signature tells a verifier which key type and recovery id
 * produced it.
 */

import * as bitcoin from 'bitcoinjs-lib';
import { ecc } from './ecc.js';
import { deriveKeyMap } from './key-map.js';

function varIntBuffer(n) {
  if (n < 0xfd) return Buffer.from([n]);
  if (n <= 0xffff) {
    const b = Buffer.alloc(3);
    b[0] = 0xfd;
    b.writeUInt16LE(n, 1);
    return b;
  }
  const b = Buffer.alloc(5);
  b[0] = 0xfe;
  b.writeUInt32LE(n, 1);
  return b;
}

function messageHash(message) {
  const prefixBuffer = Buffer.from('Bitcoin Signed Message:\n', 'utf8');
  const msgBuffer = Buffer.from(message, 'utf8');
  return bitcoin.crypto.hash256(Buffer.concat([
    varIntBuffer(prefixBuffer.length), prefixBuffer,
    varIntBuffer(msgBuffer.length), msgBuffer,
  ]));
}

/**
 * @param {string} message
 * @param {string} seedPhrase
 * @param {string} networkName 'mainnet' | 'testnet4'
 * @param {Array} addresses candidate signing addresses, most preferred first
 * @returns {Promise<string>} base64 signature
 */
export async function signMessageWithKeys(message, seedPhrase, networkName, addresses) {
  const keyMap = await deriveKeyMap(seedPhrase, networkName, addresses);

  // P2WPKH first: the DEX cancel flow verifies against a P2WPKH signature.
  const p2wpkhKey = [...keyMap.values()].find(k => k.type === 'p2wpkh');
  const signingKeyInfo = p2wpkhKey || keyMap.values().next().value;
  if (!signingKeyInfo) throw new Error('No key available to sign message');

  const { privateKey, publicKey, type } = signingKeyInfo;
  const hash = messageHash(message);

  if (type === 'p2wpkh') {
    // Raw key, no negation. Header 39-42 marks compressed P2WPKH.
    const sigRaw = ecc.sign(hash, privateKey);

    let recoveryId = 0;
    for (let rid = 0; rid < 2; rid++) {
      const recovered = ecc.recover(hash, sigRaw, rid, true);
      if (recovered && Buffer.from(recovered).equals(Buffer.from(publicKey))) {
        recoveryId = rid;
        break;
      }
    }

    return Buffer.concat([Buffer.from([39 + recoveryId]), sigRaw]).toString('base64');
  }

  // P2TR: negate on odd Y, header 31.
  const signingKey = publicKey[0] === 0x03 ? ecc.privateNegate(privateKey) : privateKey;
  const sigRaw = ecc.sign(hash, signingKey);
  return Buffer.concat([Buffer.from([31]), sigRaw]).toString('base64');
}
