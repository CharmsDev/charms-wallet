/**
 * Type 2 — Password wallet orchestration.
 *
 * The mnemonic pre-exists (random for fresh wallets, imported for
 * existing seeds). It is encrypted with a PBKDF2-derived key and
 * stored as ciphertext in the v3 blob.
 *
 * Public API:
 *   createPasswordWallet({ mnemonic, password })  → writes Type 2 blob
 *   unlockPasswordWallet({ password })            → mnemonic
 *
 * Browser password autofill is handled at the UI layer via semantic
 * HTML (`<form>` + `autocomplete="current-password"`). This module
 * stays UI-agnostic.
 */

import { importAesKey, encryptString, decryptString } from './aes-gcm';
import {
  deriveKeyFromPassword, validatePassword,
  PBKDF2_ITERATIONS, PBKDF2_SALT_BYTES,
} from './password-crypt';
import { readBlob, writeBlob, BLOB_VERSION } from './blob';
import { b64, b64decode } from './codec';

const AAD = 'charms-wallet/seed-pwd/v3';

/**
 * Setup flow. Encrypts the supplied mnemonic and writes the Type 2 blob.
 *
 * @param {object} opts
 * @param {string} opts.mnemonic  the BIP39 mnemonic to protect
 * @param {string} opts.password  validated against the policy
 */
export async function createPasswordWallet({ mnemonic, password }) {
  if (typeof mnemonic !== 'string' || mnemonic.trim().length === 0) {
    throw new Error('createPasswordWallet: mnemonic must be a non-empty string');
  }
  const check = validatePassword(password);
  if (!check.ok) throw new Error(check.reason);

  const kdfSalt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const aesRawKey = await deriveKeyFromPassword(password, kdfSalt, PBKDF2_ITERATIONS);
  const aesKey = await importAesKey(aesRawKey);
  const { iv, ciphertext } = await encryptString(aesKey, mnemonic, AAD);
  aesRawKey.fill(0);

  await writeBlob({
    version: BLOB_VERSION,
    type: 'password',
    kdfSalt: b64(kdfSalt),
    kdfIter: PBKDF2_ITERATIONS,
    iv: b64(iv),
    ciphertext: b64(ciphertext),
    enrolledAt: new Date().toISOString(),
  });
}

/**
 * Unlock flow. Re-derives the key from the supplied password and
 * decrypts the stored mnemonic. Throws 'Incorrect password' on
 * AAD/tag mismatch.
 */
export async function unlockPasswordWallet({ password }) {
  const blob = await readBlob();
  if (!blob || blob.version !== BLOB_VERSION || blob.type !== 'password') {
    throw new Error('No password wallet enrolled on this device.');
  }
  // Structural validation up-front so corruption surfaces as a distinct
  // error vs. "Incorrect password" (which the user might trust as
  // recoverable by trying another password — a corrupt blob is not).
  if (!blob.kdfSalt || !blob.iv || !blob.ciphertext) {
    throw new Error('Auth blob is corrupted (missing fields). Restore from your seed phrase.');
  }

  let kdfSalt, iv, ciphertext;
  try {
    kdfSalt = b64decode(blob.kdfSalt);
    iv = b64decode(blob.iv);
    ciphertext = b64decode(blob.ciphertext);
  } catch (_) {
    throw new Error('Auth blob is corrupted (decode failed). Restore from your seed phrase.');
  }

  const iters = blob.kdfIter || PBKDF2_ITERATIONS;
  const aesRawKey = await deriveKeyFromPassword(password, kdfSalt, iters);
  const aesKey = await importAesKey(aesRawKey);

  let mnemonic;
  try {
    mnemonic = await decryptString(aesKey, iv, ciphertext, AAD);
  } catch (_) {
    aesRawKey.fill(0);
    throw new Error('Incorrect password.');
  }
  aesRawKey.fill(0);
  return mnemonic;
}
