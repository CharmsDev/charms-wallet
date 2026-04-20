/**
 * Bitcoin signing utilities shared across beam executors.
 */

/**
 * Convert a compact 64-byte ECDSA signature (r||s) to DER.
 *
 * Used when signing P2WPKH inputs — tiny-secp256k1's ecc.sign() returns compact,
 * but Bitcoin expects DER in witnesses.
 */
export function compactToDER(sig) {
  let r = sig.subarray(0, 32);
  let s = sig.subarray(32, 64);
  while (r.length > 1 && r[0] === 0 && !(r[1] & 0x80)) r = r.subarray(1);
  while (s.length > 1 && s[0] === 0 && !(s[1] & 0x80)) s = s.subarray(1);
  if (r[0] & 0x80) r = Buffer.concat([Buffer.from([0]), r]);
  if (s[0] & 0x80) s = Buffer.concat([Buffer.from([0]), s]);
  const total = 2 + r.length + 2 + s.length;
  return Buffer.concat([Buffer.from([0x30, total, 0x02, r.length]), r, Buffer.from([0x02, s.length]), s]);
}
