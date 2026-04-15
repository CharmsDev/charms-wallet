/**
 * Beam cryptographic utilities.
 * Pure functions — no side effects, no chain-specific imports.
 */

/**
 * Compute the UTXO ID hash used for beam_to commitment.
 * Must match Rust: utxo_id_hash() in charms-client/src/lib.rs
 *
 * @param {string} txid  - Transaction ID (hex, normal byte order)
 * @param {number} vout  - Output index
 * @returns {string}     - SHA256 hash as hex string (32 bytes)
 */
export async function utxoIdHash(txid, vout) {
  // Build 36-byte buffer: txid (32 bytes, reversed) + vout (4 bytes, LE)
  const buf = new Uint8Array(36);

  // Reverse txid bytes (Bitcoin internal byte order)
  const txidBytes = hexToBytes(txid);
  for (let i = 0; i < 32; i++) {
    buf[i] = txidBytes[31 - i];
  }

  // Write vout as little-endian uint32
  const view = new DataView(buf.buffer);
  view.setUint32(32, vout, true);

  // SHA256
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return bytesToHex(new Uint8Array(hashBuf));
}

// ── Hex helpers ─────────────────────────────────────────────────────────────

export function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
