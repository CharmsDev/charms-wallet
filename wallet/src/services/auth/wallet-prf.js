/**
 * Type 1 — Pure PRF wallet orchestration.
 *
 * One passkey = one wallet. Salt is the constant `"charms"` (encoded
 * to 32 bytes via SHA-256 so the PRF eval has a fixed-width input —
 * the bare ASCII "charms" would still work but locking it to 32 bytes
 * matches the spec convention and avoids any padding surprises).
 *
 * Public API:
 *   createPrfWallet({ displayName })   → mnemonic, writes Type 1 blob
 *   unlockPrfWallet()                  → mnemonic, no storage write
 *
 * Both return the 24-word BIP39 mnemonic. The caller (AuthContext /
 * setup wizard) pushes that string into walletStore so the rest of
 * the app can derive addresses with the usual BIP32/44 chain.
 *
 * The PRF bytes and the mnemonic both live only in RAM for the
 * duration of the session. Tab close = both lost. Next open requires
 * a fresh biometric.
 */

import { enrollPrf, derivePrf, discoverPrf, isPrfSupported } from './prf-derive';
import { bytesToMnemonic } from './seed-derive';
import { readBlob, writeBlob, BLOB_VERSION } from './blob';
import { b64, b64decode, b64url, b64urlDecode } from './codec';

const SALT_LABEL = 'charms';

/** Deterministically expand the salt label to 32 bytes via SHA-256.
 *  Single wallet per passkey → label is constant. If we ever support
 *  multi-wallet, this becomes the per-wallet input. */
async function deriveSalt() {
  const labelBytes = new TextEncoder().encode(SALT_LABEL);
  const hash = await crypto.subtle.digest('SHA-256', labelBytes);
  return new Uint8Array(hash);
}

/**
 * Setup flow. Runs the WebAuthn create ceremony, captures the PRF
 * bytes, derives the mnemonic, writes the Type 1 blob (metadata only).
 *
 * @returns {Promise<string>} the 24-word mnemonic (in RAM, caller's responsibility)
 */
export async function createPrfWallet({ displayName } = {}) {
  if (!isPrfSupported()) {
    throw new Error('Passkey unlock is not supported on this browser.');
  }

  const salt = await deriveSalt();
  const material = await enrollPrf({ displayName, salt });

  const mnemonic = bytesToMnemonic(material.prfBytes);
  material.prfBytes.fill(0); // wipe — mnemonic is now the canonical form

  await writeBlob({
    version: BLOB_VERSION,
    type: 'prf',
    credentialId: b64url(material.credentialId),
    prfSalt: b64(material.prfSalt),
    rpId: material.rpId,
    enrolledAt: new Date().toISOString(),
  });

  return mnemonic;
}

/**
 * Restore flow for fresh devices: looks up the user's synced passkey
 * (iCloud Keychain / Google Password Manager) without knowing its
 * credentialId, runs the PRF eval with the SAME salt, derives the
 * SAME mnemonic the original device produced, and persists the blob
 * locally so future opens can use the cheap `unlockPrfWallet()` path.
 *
 * Returns the mnemonic on success, or `null` if the user cancelled
 * the system picker or no discoverable credential was found. The
 * caller (setup wizard) decides whether to fall back to
 * `createPrfWallet()` (= "create new wallet") or retry.
 *
 * @returns {Promise<string|null>}
 */
export async function restorePrfWallet() {
  if (!isPrfSupported()) {
    throw new Error('Passkey unlock is not supported on this browser.');
  }
  const salt = await deriveSalt();
  const discovered = await discoverPrf(salt);
  if (!discovered) return null;          // user cancelled or no creds

  const mnemonic = bytesToMnemonic(discovered.prfBytes);
  discovered.prfBytes.fill(0);

  await writeBlob({
    version: BLOB_VERSION,
    type: 'prf',
    credentialId: b64url(discovered.credentialId),
    prfSalt: b64(salt),
    rpId: discovered.rpId,
    enrolledAt: new Date().toISOString(),
  });

  return mnemonic;
}

/**
 * Unlock flow. Re-runs the WebAuthn assertion with the stored
 * credential, re-derives the same PRF bytes, re-derives the same
 * mnemonic. Idempotent — no storage write.
 *
 * @returns {Promise<string>} the 24-word mnemonic
 */
export async function unlockPrfWallet() {
  const blob = await readBlob();
  if (!blob || blob.version !== BLOB_VERSION || blob.type !== 'prf') {
    throw new Error('No passkey wallet enrolled on this device.');
  }

  const prfBytes = await derivePrf({
    credentialId: b64urlDecode(blob.credentialId),
    prfSalt: b64decode(blob.prfSalt),
    rpId: blob.rpId,
  });

  const mnemonic = bytesToMnemonic(prfBytes);
  prfBytes.fill(0);
  return mnemonic;
}
