/**
 * Shared auth-blob storage helpers.
 *
 * Blob format v2 (current):
 *   {
 *     version: 2,
 *     method:  'prf' | 'password',
 *     iv:           <base64>,
 *     ciphertext:   <base64>,
 *     enrolledAt:   <ISO>,
 *
 *     // method='prf' specifics
 *     credentialId: <base64url>,
 *     prfSalt:      <base64>,
 *     rpId:         <host>,
 *
 *     // method='password' specifics
 *     kdfSalt:      <base64>,
 *     kdfIter:      <int>,
 *   }
 *
 * Blob format v1 (legacy, read-only): implicit method=prf, no `method`
 * field, AAD = 'charms-wallet/seed/v1'. Written by early G002 builds;
 * unlock() still accepts it so users mid-migration aren't bricked.
 */

import { StorageAdapter } from '../storage-adapter';
import { SYSTEM_KEYS } from '../storage-keys';

export async function readAuthBlob() {
  const raw = await StorageAdapter.get(SYSTEM_KEYS.AUTH);
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

export async function writeAuthBlob(blob) {
  await StorageAdapter.set(SYSTEM_KEYS.AUTH, JSON.stringify(blob));
}

export async function removeAuthBlob() {
  await StorageAdapter.remove(SYSTEM_KEYS.AUTH);
}

/** @returns 'prf' | 'password' | null */
export async function getAuthMethod() {
  const blob = await readAuthBlob();
  if (!blob) return null;
  if (blob.version === 1) return 'prf';            // legacy
  if (blob.version === 2) return blob.method || null;
  return null;                                      // unknown future version
}

/** Whether the current device has any stored auth blob (any method). */
export async function isEnrolled() {
  return !!(await readAuthBlob());
}
