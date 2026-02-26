/**
 * Spell Normalizer for Charm Transfers (v10)
 * Port of charms-cast spell-normalizer.ts — stripped to JS for the extension.
 *
 * Converts a human-friendly Spell object into the NormalizedSpell hex-CBOR
 * format expected by the v10 prover API.
 *
 * CBOR encoding rules (ciborium non-human-readable):
 *  - App keys in app_public_inputs: CBOR tuple [tag_string, B32_array, B32_array]
 *  - App in charm data / private_inputs: string "t/txid/vk" (DisplayFromStr)
 *  - UtxoId: 36-byte byte string (txid REVERSED + vout LE)
 *  - Vec<u8> (dest): array of integers, NOT Uint8Array
 *  - ins: always [] (empty array), NEVER null
 *  - Maps: standard CBOR maps, NO Tag 259
 */

import { Encoder } from 'cbor-x';

// mapsAsObjects=false → standard CBOR maps (no Tag 259), compatible with ciborium
const cborEncoder = new Encoder({ mapsAsObjects: false });

// ── Helpers ──────────────────────────────────────────────────────────────────

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function objectToMap(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return value.map(objectToMap);
  if (value instanceof Map) {
    const m = new Map();
    for (const [k, v] of value) m.set(k, objectToMap(v));
    return m;
  }
  if (typeof value === 'object') {
    const m = new Map();
    for (const [k, v] of Object.entries(value)) m.set(k, objectToMap(v));
    return m;
  }
  return value;
}

function cborToHex(value) {
  return toHex(cborEncoder.encode(objectToMap(value)));
}

/**
 * "txid:vout" → 36-byte Uint8Array (txid reversed + vout LE)
 */
function utxoIdToBytes(utxoIdStr) {
  const [txidHex, voutStr] = utxoIdStr.split(':');
  const vout = parseInt(voutStr, 10);
  const txidBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++)
    txidBytes[i] = parseInt(txidHex.substring(i * 2, i * 2 + 2), 16);
  txidBytes.reverse();
  const buf = new Uint8Array(36);
  buf.set(txidBytes, 0);
  new DataView(buf.buffer).setUint32(32, vout, true);
  return buf;
}

/**
 * "t/txid/vk" → CBOR tuple [tag, B32_identity, B32_vk]
 */
function appToCborTuple(appIdStr) {
  const parts = appIdStr.split('/');
  if (parts.length !== 3) throw new Error(`Invalid App ID: ${appIdStr}`);
  const [tag, identityHex, vkHex] = parts;
  const identity = [];
  const vk = [];
  for (let i = 0; i < 64; i += 2) {
    identity.push(parseInt(identityHex.substring(i, i + 2), 16));
    vk.push(parseInt(vkHex.substring(i, i + 2), 16));
  }
  return [tag, identity, vk];
}

// ── Address → scriptPubKey ────────────────────────────────────────────────────

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Decode(str) {
  const s = str.toLowerCase();
  const sep = s.lastIndexOf('1');
  if (sep < 1) throw new Error('Invalid bech32: ' + str);
  const prefix = s.slice(0, sep);
  const words = [];
  for (let i = sep + 1; i < s.length - 6; i++) {
    const idx = BECH32_CHARSET.indexOf(s[i]);
    if (idx === -1) throw new Error('Invalid bech32 char: ' + s[i]);
    words.push(idx);
  }
  return { prefix, words };
}

function convertBits(data, fromBits, toBits, pad) {
  let acc = 0, bits = 0;
  const result = [], maxv = (1 << toBits) - 1;
  for (const v of data) {
    acc = (acc << fromBits) | v;
    bits += fromBits;
    while (bits >= toBits) { bits -= toBits; result.push((acc >> bits) & maxv); }
  }
  if (pad && bits > 0) result.push((acc << (toBits - bits)) & maxv);
  return result;
}

function addressToScriptPubkey(address) {
  const { words } = bech32Decode(address);
  const ver = words[0];
  const prog = convertBits(words.slice(1), 5, 8, false);
  if (ver === 0) return [0x00, prog.length, ...prog];          // P2WPKH / P2WSH
  if (ver === 1) return [0x51, prog.length, ...prog];          // P2TR
  return [0x50 + ver, prog.length, ...prog];
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Normalize a Spell and return:
 *  - normalizedSpellHex: hex-CBOR of NormalizedSpell
 *  - appPrivateInputs: { appIdStr: hexCborOfPrivateInput }
 *  - txInsBeamedSourceUtxos: {} (always empty for transfers)
 */
export function normalizeSpell(spell) {
  const apps = spell.apps || {};

  // Sort apps (BTreeSet ordering)
  const uniqueApps = [...new Set(Object.values(apps))].sort();
  const appToIndex = new Map();
  uniqueApps.forEach((app, i) => appToIndex.set(app, i));

  // app_public_inputs: all apps → null (no public args for transfers)
  const appPublicInputsCbor = new Map();
  for (const [, appId] of Object.entries(apps)) {
    appPublicInputsCbor.set(appToCborTuple(appId), null);
  }

  // NormalizedCharms per output: alias keys → numeric indices
  const normalizedOuts = spell.outs.map(out => {
    const nCharms = new Map();
    if (out.charms) {
      for (const [alias, charmData] of Object.entries(out.charms)) {
        const appId = apps[alias];
        if (!appId) throw new Error(`Unknown alias: ${alias}`);
        nCharms.set(appToIndex.get(appId), charmData);
      }
    }
    return nCharms;
  });

  // ins: UtxoId byte strings
  const ins = spell.ins.length > 0
    ? spell.ins.map(input => utxoIdToBytes(input.utxo_id))
    : [];

  // coins: NativeOutput per output
  const DEFAULT_COIN = 300;
  const coins = spell.outs.map(out => ({
    amount: out.coin ?? DEFAULT_COIN,
    dest: addressToScriptPubkey(out.address),
  }));

  const normalizedSpell = {
    version: spell.version,
    tx: { ins, outs: normalizedOuts, coins },
    app_public_inputs: appPublicInputsCbor,
  };

  const normalizedSpellHex = cborToHex(normalizedSpell);

  // app_private_inputs
  const privateArgs = spell.private_inputs || {};
  const appPrivateInputs = {};
  for (const [alias, appId] of Object.entries(apps)) {
    const priv = privateArgs[alias] ?? null;
    appPrivateInputs[appId] = cborToHex(priv);
  }

  return { normalizedSpellHex, appPrivateInputs, txInsBeamedSourceUtxos: {} };
}
