/**
 * Auth blob persistence — v3 format only.
 *
 * The blob shape depends on the wallet type chosen at setup:
 *
 *   Type 1 (Pure PRF — passkey IS the wallet, mnemonic derived on demand):
 *     {
 *       version: 3,
 *       type: 'prf',
 *       credentialId: <base64url>,
 *       prfSalt:      <base64>,
 *       rpId:         <host>,
 *       enrolledAt:   <ISO>,
 *     }
 *
 *   Type 2 (Password — random/imported mnemonic, encrypted at rest):
 *     {
 *       version: 3,
 *       type: 'password',
 *       kdfSalt:    <base64>,
 *       kdfIter:    <int>,        // PBKDF2 iterations
 *       iv:         <base64>,     // AES-GCM nonce
 *       ciphertext: <base64>,     // mnemonic encrypted
 *       enrolledAt: <ISO>,
 *     }
 *
 * No retro-compat with v1/v2 — prod has never seen an encrypted blob,
 * so we ship clean. Anyone running a v1/v2 dev build will get a "blob
 * version unsupported" error and is expected to delete + recreate.
 */

import { StorageAdapter } from '../storage-adapter';
import { SYSTEM_KEYS } from '../storage-keys';

export const BLOB_VERSION = 3;

export async function readBlob() {
  const raw = await StorageAdapter.get(SYSTEM_KEYS.AUTH);
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

export async function writeBlob(blob) {
  if (!blob || blob.version !== BLOB_VERSION) {
    throw new Error(`writeBlob: refusing to write non-v${BLOB_VERSION} blob`);
  }
  await StorageAdapter.set(SYSTEM_KEYS.AUTH, JSON.stringify(blob));
}

export async function removeBlob() {
  await StorageAdapter.remove(SYSTEM_KEYS.AUTH);
}

/** @returns 'prf' | 'password' | null */
export async function getWalletType() {
  const blob = await readBlob();
  if (!blob) return null;
  if (blob.version !== BLOB_VERSION) return null;
  if (blob.type === 'prf' || blob.type === 'password') return blob.type;
  return null;
}

/** True if any v3 blob is present. */
export async function isEnrolled() {
  return (await getWalletType()) !== null;
}
