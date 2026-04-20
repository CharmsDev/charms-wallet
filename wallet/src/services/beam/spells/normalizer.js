/**
 * Beam Spell Normalizer.
 *
 * Extends the standard spell normalizer to handle beam_to outputs.
 * The key difference: beamed outputs produce a `beamed_outs` map in the
 * normalized spell, and their `coins` entry has no `dest` (no address).
 */

import { hexToBytes } from '../core/crypto';
import { cborToHex, utxoIdToBytes, appToCborTuple, safeInt } from '../core/cbor';

// Bech32 decode for BTC addresses
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Decode(str) {
  const s = str.toLowerCase();
  const sep = s.lastIndexOf('1');
  if (sep < 1) throw new Error('Invalid bech32: ' + str);
  const words = [];
  for (let i = sep + 1; i < s.length - 6; i++) {
    const idx = BECH32_CHARSET.indexOf(s[i]);
    if (idx === -1) throw new Error('Invalid bech32 char: ' + s[i]);
    words.push(idx);
  }
  return { words };
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
  if (ver === 0) return [0x00, prog.length, ...prog];
  if (ver === 1) return [0x51, prog.length, ...prog];
  return [0x50 + ver, prog.length, ...prog];
}

// ── Main export ─────────────────────────────────────────────────────────────

/**
 * Normalize a beam spell.
 *
 * @param {object} spell - Beam spell from builder
 * @returns {{ normalizedSpellHex: string, appPrivateInputs: object, txInsBeamedSourceUtxos: object }}
 */
export function normalizeBeamSpell(spell) {
  const apps = spell.apps || {};
  const uniqueApps = [...new Set(Object.values(apps))].sort();
  const appToIndex = new Map();
  uniqueApps.forEach((app, i) => appToIndex.set(app, i));

  // app_public_inputs
  const appPublicInputsCbor = new Map();
  for (const [, appId] of Object.entries(apps)) {
    appPublicInputsCbor.set(appToCborTuple(appId), null);
  }

  // Normalized outputs + beamed_outs detection
  const beamedOuts = new Map();
  const normalizedOuts = [];
  const coins = [];
  const DEFAULT_COIN = 300;

  spell.outs.forEach((out, index) => {
    // Charms per output
    const nCharms = new Map();
    if (out.charms) {
      for (const [alias, charmData] of Object.entries(out.charms)) {
        const appId = apps[alias];
        if (!appId) throw new Error(`Unknown alias: ${alias}`);
        nCharms.set(appToIndex.get(appId), charmData);
      }
    }
    normalizedOuts.push(nCharms);

    // Beamed output: has beam_to AND an address (prover requires valid address on all outputs)
    if (out.beam_to) {
      beamedOuts.set(index, new Uint8Array(hexToBytes(out.beam_to)));
    }

    // All outputs need a coin entry with address
    if (out.address) {
      // Normal output with BTC address
      coins.push({
        amount: safeInt(out.coin ?? DEFAULT_COIN),
        dest: addressToScriptPubkey(out.address),
      });
    }
  });

  // ins
  const ins = spell.ins.length > 0
    ? spell.ins.map(input => utxoIdToBytes(input.utxo_id))
    : [];

  // Build normalized spell
  const normalizedSpell = {
    version: spell.version,
    tx: {
      ins,
      outs: normalizedOuts,
      beamed_outs: beamedOuts.size > 0 ? beamedOuts : undefined,
      coins,
    },
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

  // txInsBeamedSourceUtxos: empty for beam OUT (we're sending, not receiving)
  return { normalizedSpellHex, appPrivateInputs, txInsBeamedSourceUtxos: {} };
}
