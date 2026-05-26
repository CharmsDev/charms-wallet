/**
 * Password-based unlock — the universal-fallback path for browsers /
 * devices without WebAuthn PRF (Firefox, Linux, very old browsers).
 *
 * Public API:
 *   enrollPassword(seedPhrase, password)  → writes the v2 blob
 *   unlockPassword(password)              → returns plaintext seed
 *
 * Cryptographic envelope is identical to the passkey path (AES-GCM 256
 * with per-encrypt IV and method-specific AAD). The only difference is
 * where the AES key comes from: here it's PBKDF2(password, salt) rather
 * than HKDF(PRF result).
 */

import { importAesKey, encryptString, decryptString } from './aes-gcm';
import { deriveKeyFromPassword, PBKDF2_ITERATIONS, PBKDF2_SALT_BYTES, validatePassword } from './password-kdf';
import { readAuthBlob, writeAuthBlob } from './blob';

const AAD_SEED_PWD_V2 = 'charms-wallet/seed-pwd/v2';

// ── codec helpers (duplicated from passkey-prf to keep modules
// independent; trivial enough that a shared util isn't worth it) ──

function b64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function b64decode(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Derive an AES key from the user's password, encrypt the seed,
 * persist the v2 blob.
 *
 * @param {string} seedPhrase
 * @param {string} password
 * @returns {Promise<{enrolledAt:string}>}
 */
export async function enrollPassword(seedPhrase, password) {
  if (typeof seedPhrase !== 'string' || seedPhrase.trim().length === 0) {
    throw new Error('enrollPassword: seedPhrase must be a non-empty string');
  }
  const check = validatePassword(password);
  if (!check.ok) throw new Error(check.reason);

  const kdfSalt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const aesRawKey = await deriveKeyFromPassword(password, kdfSalt, PBKDF2_ITERATIONS);
  const aesKey = await importAesKey(aesRawKey);
  const { iv, ciphertext } = await encryptString(aesKey, seedPhrase, AAD_SEED_PWD_V2);

  aesRawKey.fill(0);

  const blob = {
    version: 2,
    method: 'password',
    kdfSalt: b64(kdfSalt),
    kdfIter: PBKDF2_ITERATIONS,
    iv: b64(iv),
    ciphertext: b64(ciphertext),
    enrolledAt: new Date().toISOString(),
  };
  await writeAuthBlob(blob);

  return { enrolledAt: blob.enrolledAt };
}

/**
 * Re-derive the AES key from the supplied password, decrypt the seed.
 *
 * Throws on wrong password (AES-GCM tag mismatch → 'OperationError').
 *
 * @param {string} password
 * @returns {Promise<string>} seed phrase plaintext
 */
export async function unlockPassword(password) {
  const blob = await readAuthBlob();
  if (!blob) throw new Error('No auth blob found — wallet is not encrypted.');
  if (blob.version !== 2 || blob.method !== 'password') {
    throw new Error('This wallet is not configured for password unlock.');
  }

  const kdfSalt = b64decode(blob.kdfSalt);
  const iters = blob.kdfIter || PBKDF2_ITERATIONS;
  const aesRawKey = await deriveKeyFromPassword(password, kdfSalt, iters);
  const aesKey = await importAesKey(aesRawKey);
  const iv = b64decode(blob.iv);
  const ciphertext = b64decode(blob.ciphertext);

  let seedPhrase;
  try {
    seedPhrase = await decryptString(aesKey, iv, ciphertext, AAD_SEED_PWD_V2);
  } catch (err) {
    aesRawKey.fill(0);
    throw new Error('Incorrect password.');
  }
  aesRawKey.fill(0);
  return seedPhrase;
}
