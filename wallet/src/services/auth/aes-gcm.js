/**
 * AES-GCM 256 helpers built on Web Crypto.
 *
 * Tiny on purpose — the auth layer doesn't need a general crypto kit,
 * just one symmetric primitive with associated data + tag.
 *
 * IV is 96 bits (12 bytes), the recommended size for GCM. We generate a
 * fresh IV per encrypt; reusing one with the same key would catastrophically
 * leak plaintext, so callers must never persist the IV in a way that
 * could be re-used with a different message under the same key.
 *
 * AAD (additional authenticated data) carries a versioned domain tag —
 * mismatch on decrypt throws OperationError, which we let bubble.
 */

const TAG_LENGTH_BITS = 128;

/** Import 32 raw bytes (from HKDF) into a Web Crypto AES-GCM CryptoKey. */
export async function importAesKey(rawBytes) {
  if (!(rawBytes instanceof Uint8Array) || rawBytes.byteLength !== 32) {
    throw new Error('importAesKey: expected 32 raw bytes (AES-256)');
  }
  return crypto.subtle.importKey(
    'raw',
    rawBytes,
    { name: 'AES-GCM' },
    /* extractable */ false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt a UTF-8 string. Returns { iv, ciphertext } as Uint8Arrays
 *  (ciphertext includes the GCM tag at the tail). */
export async function encryptString(key, plaintext, aad) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const aadBytes = typeof aad === 'string' ? new TextEncoder().encode(aad) : aad;
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aadBytes, tagLength: TAG_LENGTH_BITS },
      key,
      encoded,
    ),
  );
  return { iv, ciphertext };
}

/** Decrypt to UTF-8 string. Throws if the AAD or tag doesn't match. */
export async function decryptString(key, iv, ciphertext, aad) {
  const aadBytes = typeof aad === 'string' ? new TextEncoder().encode(aad) : aad;
  const plaintextBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: aadBytes, tagLength: TAG_LENGTH_BITS },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plaintextBuf);
}
