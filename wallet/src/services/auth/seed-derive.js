/**
 * Seed-phrase derivation helpers.
 *
 * Converts 32 raw bytes (PRF output, random entropy, etc.) into a
 * standard BIP39 24-word mnemonic. Downstream BIP32/BIP44 derivation
 * happens elsewhere (utils/wallet, lib/cardano/wallet, etc.) using
 * the same mnemonic — guaranteeing cross-wallet portability:
 *
 *   m/86'/0'/0'/0/0     Bitcoin Taproot
 *   m/1852'/1815'/0'/0/0  Cardano CIP-1852
 *
 * Any third-party BIP39 wallet (Electrum, Sparrow, Eternl) that
 * implements the same paths sees identical addresses given the same
 * mnemonic.
 */

import * as bip39 from 'bip39';

/** Convert raw bytes (Uint8Array) to a hex string. */
function bytesToHex(bytes) {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

/**
 * 32 raw bytes → 24-word BIP39 mnemonic.
 *
 * @param {Uint8Array} entropy  32 bytes (256 bits → 24 words)
 * @returns {string} space-separated mnemonic
 */
export function bytesToMnemonic(entropy) {
  if (!(entropy instanceof Uint8Array) || entropy.length !== 32) {
    throw new Error('bytesToMnemonic: expected 32 raw bytes');
  }
  return bip39.entropyToMnemonic(bytesToHex(entropy));
}

/**
 * Generate a fresh random BIP39 mnemonic for the Type 2 path. Uses
 * Web Crypto via bip39's internal RNG (Node Buffer in test envs).
 *
 * @param {number} strength  bits of entropy; default 256 → 24 words
 * @returns {string} space-separated mnemonic
 */
export function generateRandomMnemonic(strength = 256) {
  return bip39.generateMnemonic(strength);
}

/**
 * Normalise + validate a user-provided mnemonic. Throws on invalid.
 *
 * @param {string} mnemonic
 * @returns {string} normalised lowercase mnemonic
 */
export function validateMnemonic(mnemonic) {
  const normalized = String(mnemonic || '').trim().toLowerCase();
  if (!bip39.validateMnemonic(normalized)) {
    throw new Error('Invalid seed phrase. Please check and try again.');
  }
  return normalized;
}
