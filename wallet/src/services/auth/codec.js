/**
 * Tiny codec helpers — base64 + base64url + hex.
 *
 * Kept dependency-free (no Buffer, no Node compat) so they run
 * identically in the wallet web (Next.js) and the extension (Vite).
 */

export function b64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function b64decode(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function b64url(bytes) {
  return b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(s) {
  let normalised = s.replace(/-/g, '+').replace(/_/g, '/');
  while (normalised.length % 4) normalised += '=';
  return b64decode(normalised);
}
