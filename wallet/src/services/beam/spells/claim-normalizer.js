/**
 * Claim Spell Normalizer.
 *
 * Normalizes the Cardano claim spell for the prover API.
 * Key difference from beam normalizer: beamed_from on inputs (not beam_to on outputs),
 * and addresses are Cardano bech32 (not Bitcoin segwit).
 */

import { hexToBytes } from '../core/crypto';
import { cborToHex, utxoIdToBytes, appToCborTuple, safeInt } from '../core/cbor';

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
