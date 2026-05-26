/**
 * PBKDF2-SHA256 key derivation for the password-based unlock path.
 *
 * Iterations: 600,000 — OWASP 2024 recommendation for PBKDF2-SHA256.
 * On a modern laptop this is ~250 ms one-time per unlock, which the
 * user perceives as "instant" but is expensive enough to make
 * offline GPU brute-forcing of a sane password impractical.
 *
 * Why not Argon2 / scrypt: Web Crypto has PBKDF2 native (no deps,
 * no wasm). Argon2 would be stronger memory-hard but pulls in
 * ~50 KB of wasm; the trade-off isn't worth it for a wallet that
 * already enforces a 12-char minimum and three character classes.
 */

export const PBKDF2_ITERATIONS = 600_000;
export const PBKDF2_SALT_BYTES = 32;
export const AES_KEY_BYTES = 32;

/**
 * Derive a 256-bit AES key from a password + salt.
 *
 * @param {string} password - the user's password (UTF-8)
 * @param {Uint8Array} salt - random salt (32 bytes recommended)
 * @param {number} iterations - PBKDF2 iteration count
 * @returns {Promise<Uint8Array>} raw key bytes (32) — caller wipes after use
 */
export async function deriveKeyFromPassword(password, salt, iterations = PBKDF2_ITERATIONS) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('deriveKeyFromPassword: password must be a non-empty string');
  }
  if (!(salt instanceof Uint8Array) || salt.length < 16) {
    throw new Error('deriveKeyFromPassword: salt must be a Uint8Array of >= 16 bytes');
  }

  const pwBytes = new TextEncoder().encode(password);
  const baseKey = await crypto.subtle.importKey(
    'raw', pwBytes, 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    AES_KEY_BYTES * 8
  );
  // Best-effort wipe of the UTF-8 password buffer; the original
  // JS string can't be deterministically zeroed (V8 internals).
  pwBytes.fill(0);
  return new Uint8Array(bits);
}

/**
 * Validate a password against the project's minimum policy:
 *   - length >= 12
 *   - contains at least 3 of: lowercase, uppercase, digit, symbol
 *
 * Returns { ok: boolean, reason?: string } so the UI can show a
 * specific error message.
 */
export function validatePassword(password) {
  if (typeof password !== 'string') return { ok: false, reason: 'Password must be a string' };
  if (password.length < 12) {
    return { ok: false, reason: 'Use at least 12 characters' };
  }
  const classes = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  if (classes < 3) {
    return { ok: false, reason: 'Include at least 3 of: lowercase, uppercase, digit, symbol' };
  }
  return { ok: true };
}
