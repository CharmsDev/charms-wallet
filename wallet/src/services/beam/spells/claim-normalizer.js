/**
 * Claim Spell Normalizer.
 *
 * Normalizes the Cardano claim spell for the prover API.
 * Key difference from beam normalizer: beamed_from on inputs (not beam_to on outputs),
 * and addresses are Cardano bech32 (not Bitcoin segwit).
 */

import { Encoder } from 'cbor-x';
import { hexToBytes } from '../core/crypto';

const cborEncoder = new Encoder({ mapsAsObjects: false });

// ── Helpers ─────────────────────────────────────────────────────────────────

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function safeInt(n) {
  if (typeof n === 'bigint') return n;
  if (typeof n === 'number' && n > 0xFFFFFFFF) return BigInt(Math.round(n));
  return n;
}

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

function cborToHex(value) {
  return toHex(cborEncoder.encode(objectToMap(value)));
}

/**
 * "txid:vout" → 36-byte Uint8Array (txid reversed + vout LE)
 * Works for both Bitcoin and Cardano UTXO IDs.
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

/**
 * Cardano address → raw bytes for the `dest` field.
 * Cardano bech32 addresses decode to a different format than Bitcoin.
 * For the prover, we pass raw address bytes.
 */
let _cachedCSL = null;

async function ensureCardanoWasm() {
  if (_cachedCSL) return _cachedCSL;
  const { waitForCardanoWasm, getCardanoWasm } = await import('@/lib/cardano/cardanoWasm');
  await waitForCardanoWasm();
  _cachedCSL = getCardanoWasm();
  return _cachedCSL;
}

function cardanoAddressToBytes(address) {
  // CSL must be loaded before calling normalizeClaimSpell.
  // The executor ensures WASM is ready before reaching this point.
  if (!_cachedCSL) {
    throw new Error('Cardano WASM not loaded — call ensureCardanoWasm() before normalizing');
  }
  const addr = _cachedCSL.Address.from_bech32(address);
  return Array.from(addr.to_bytes());
}

// ── Main export ─────────────────────────────────────────────────────────────

/**
 * Normalize a claim spell for the Cardano prover.
 *
 * @param {object} spell      - From buildClaimSpell
 * @param {object} beamedFrom - { inputIndex: "sourceTxid:sourceVout" }
 * @returns {{ normalizedSpellHex, appPrivateInputs, txInsBeamedSourceUtxos }}
 */
export async function normalizeClaimSpell(spell, beamedFrom) {
  // Ensure WASM is loaded before we encode Cardano addresses
  await ensureCardanoWasm();
  const apps = spell.apps || {};
  const uniqueApps = [...new Set(Object.values(apps))].sort();
  const appToIndex = new Map();
  uniqueApps.forEach((app, i) => appToIndex.set(app, i));

  // app_public_inputs
  const appPublicInputsCbor = new Map();
  for (const [, appId] of Object.entries(apps)) {
    appPublicInputsCbor.set(appToCborTuple(appId), null);
  }

  // Normalized outputs (Cardano side — all outputs have addresses)
  const normalizedOuts = [];
  const coins = [];
  const DEFAULT_COIN = 2000000; // ~2 ADA min UTXO on Cardano

  for (const out of spell.outs) {
    const nCharms = new Map();
    if (out.charms) {
      for (const [alias, charmData] of Object.entries(out.charms)) {
        const appId = apps[alias];
        if (!appId) throw new Error(`Unknown alias: ${alias}`);
        nCharms.set(appToIndex.get(appId), charmData);
      }
    }
    normalizedOuts.push(nCharms);

    coins.push({
      amount: safeInt(out.coin ?? DEFAULT_COIN),
      dest: cardanoAddressToBytes(out.address),
    });
  }

  // ins
  const ins = spell.ins.map(input => utxoIdToBytes(input.utxo_id));

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

  // tx_ins_beamed_source_utxos: { inputIndex: BeamSource }
  // BeamSource is tuple (UtxoId, Option<u64>) → JSON: ["txid:vout", null]
  const txInsBeamedSourceUtxos = {};
  for (const [idx, sourceUtxoId] of Object.entries(beamedFrom)) {
    txInsBeamedSourceUtxos[parseInt(idx)] = [sourceUtxoId, null];
  }

  return { normalizedSpellHex, appPrivateInputs, txInsBeamedSourceUtxos };
}
