/**
 * HKDF over WebAuthn PRF output → AES-GCM key material.
 *
 * The PRF extension hands us 32 raw bytes that are deterministic per
 * (passkey, salt). We could use them directly as an AES key, but:
 *   1. Domain separation via HKDF info= lets us safely derive multiple
 *      keys from the same PRF (encryption, MAC, future uses) without
 *      collision.
 *   2. HKDF normalises whatever the authenticator chose to put in those
 *      32 bytes — required by the standard pattern for "derive an
 *      encryption key from a high-entropy secret".
 *
 * Salt for HKDF is fixed (zero bytes) since the PRF input itself acts
 * as the user-specific entropy source; the info field provides version
 * separation.
 */

const INFO_SEED_V1 = 'charms-wallet/seed-encryption/v1';
const HKDF_HASH = 'SHA-256';

/** Derive a 32-byte AES key from the PRF output. Returns raw bytes;
 *  callers wrap with aes-gcm.importAesKey. */
export async function deriveSeedKey(prfBytes) {
  if (!(prfBytes instanceof Uint8Array) || prfBytes.byteLength === 0) {
    throw new Error('deriveSeedKey: prfBytes must be non-empty Uint8Array');
  }

  // Import the PRF output as HKDF base material.
  const baseKey = await crypto.subtle.importKey(
    'raw',
    prfBytes,
    'HKDF',
    /* extractable */ false,
    ['deriveBits'],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: HKDF_HASH,
      salt: new Uint8Array(32),               // fixed empty salt (entropy is in baseKey)
      info: new TextEncoder().encode(INFO_SEED_V1),
    },
    baseKey,
    /* bits */ 256,
  );

  return new Uint8Array(derivedBits);
}
