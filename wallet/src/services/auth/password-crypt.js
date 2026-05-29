/**
 * Password encryption primitives — the engine for Type 2 wallets.
 *
 * Two surfaces:
 *   - deriveKeyFromPassword(password, salt, iters) → 32 raw bytes
 *   - validatePassword(password) → { ok, reason? }
 *
 * Iterations: 600,000 — OWASP 2024 recommendation for PBKDF2-SHA256.
 * On a modern laptop this is ~250 ms one-time per unlock. Expensive
 * enough to make offline GPU brute-forcing of a sane password
 * impractical.
 *
 * Why not Argon2 / scrypt: Web Crypto has PBKDF2 native (zero deps,
 * zero wasm). With the 12-char + 3-class policy below the entropy
 * floor is high enough that PBKDF2's GPU-vulnerability doesn't matter
 * in practice. Argon2id would be stronger but pulls ~50 KB of wasm
 * for a marginal gain in this threat model.
 */

export const PBKDF2_ITERATIONS = 600_000;
export const PBKDF2_SALT_BYTES = 32;
export const AES_KEY_BYTES = 32;

/** Derive a 256-bit key from a password + salt. Caller wipes. */
export async function deriveKeyFromPassword(password, salt, iterations = PBKDF2_ITERATIONS) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('deriveKeyFromPassword: password must be a non-empty string');
  }
  if (!(salt instanceof Uint8Array) || salt.length < 16) {
    throw new Error('deriveKeyFromPassword: salt must be a Uint8Array of >= 16 bytes');
  }

  const pwBytes = new TextEncoder().encode(password);
  const baseKey = await crypto.subtle.importKey(
    'raw', pwBytes, 'PBKDF2', /* extractable */ false, ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    AES_KEY_BYTES * 8,
  );
  pwBytes.fill(0);
  return new Uint8Array(bits);
}

/**
 * Policy:
 *   - length >= 12
 *   - >= 3 of: lowercase, uppercase, digit, symbol
 *
 * Returns { ok: boolean, reason?: string } so the UI can surface the
 * specific failure.
 */
export function validatePassword(password) {
  if (typeof password !== 'string') return { ok: false, reason: 'Password must be a string' };
  if (password.length < 12) return { ok: false, reason: 'Use at least 12 characters' };
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
