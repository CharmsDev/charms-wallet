/**
 * Shared CBOR helpers for beam spells.
 *
 * Every spell normalizer/executor encodes roughly the same shapes
 * (Map-based spell body + app tuple + utxo bytes), so this module centralizes
 * the encoding logic. Using cbor-x with mapsAsObjects: false ensures we emit
 * CBOR maps (tag 5) instead of objects, matching what the Rust prover expects.
 */

import { Encoder } from 'cbor-x';
import { bytesToHex, hexToBytes } from './crypto';

const cborEncoder = new Encoder({ mapsAsObjects: false });

/** Coerce large numbers to BigInt so cbor-x encodes them as uint64, not float. */
export function safeInt(n) {
  if (typeof n === 'bigint') return n;
  if (typeof n === 'number' && n > 0xFFFFFFFF) return BigInt(Math.round(n));
  return n;
}

/**
 * Recursively convert plain objects to Maps so cbor-x emits CBOR map type.
 * Leaves Uint8Array / BigInt / Map / Array untouched.
 */
function objectToMap(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return value;
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return value.map(objectToMap);
  if (value instanceof Map) {
    const m = new Map();
    for (const [k, v] of value) m.set(objectToMap(k), objectToMap(v));
    return m;
  }
  if (typeof value === 'number') return safeInt(value);
  if (typeof value === 'object') {
    const m = new Map();
    for (const [k, v] of Object.entries(value)) m.set(k, objectToMap(v));
    return m;
  }
  return value;
}

/** Encode a JS value as CBOR and return hex. */
export function cborToHex(value) {
  return bytesToHex(cborEncoder.encode(objectToMap(value)));
}

/**
 * Encode "txid:vout" as the 36-byte UtxoId (txid reversed + vout LE u32).
 * Matches Rust charms-client UtxoId layout.
 */
export function utxoIdToBytes(utxoIdStr) {
  const [txidHex, voutStr] = utxoIdStr.split(':');
  const vout = parseInt(voutStr, 10);
  const txidBytes = hexToBytes(txidHex);
  txidBytes.reverse();
  const buf = new Uint8Array(36);
  buf.set(txidBytes, 0);
  new DataView(buf.buffer).setUint32(32, vout, true);
  return buf;
}

/**
 * Convert an app ID string "t/identity/vk" into the 3-tuple
 * [tag_string, identity_bytes, vk_bytes] that CBOR spells use as map keys.
 */
export function appToCborTuple(appIdStr) {
  const parts = appIdStr.split('/');
  if (parts.length !== 3) throw new Error(`Invalid App ID: ${appIdStr}`);
  const [tag, identityHex, vkHex] = parts;
  const identity = Array.from(hexToBytes(identityHex));
  const vk = Array.from(hexToBytes(vkHex));
  return [tag, identity, vk];
}
