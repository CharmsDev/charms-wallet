/**
 * Beam-Back Spell Normalizers (ADA → BTC direction).
 *
 * Two normalizers:
 * 1. normalizeCardanoBeamOutSpell — Cardano side: tokens leaving Cardano,
 *    beamed_outs points to BTC placeholder hash, coins go to Cardano address
 * 2. normalizeBtcClaimSpell — Bitcoin side: claim tokens on BTC,
 *    beamed_from points to Cardano beam-out UTXO
 *
 * Both reuse the helper utilities from the standard beam normalizer.
 */

import { Encoder } from 'cbor-x';

const cborEncoder = new Encoder({ mapsAsObjects: false });

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

async function cardanoAddressToRawBytes(bech32Addr) {
  const { waitForCardanoWasm, getCardanoWasm } = await import('@/lib/cardano/cardanoWasm');
  await waitForCardanoWasm();
  const CSL = getCardanoWasm();
  return Array.from(CSL.Address.from_bech32(bech32Addr).to_bytes());
}

/**
 * Normalize a Cardano beam-out spell (ADA → BTC).
 *
 * @param {object} spell
 * @param {string} spell.tokenAppId - "t/identity/vk"
 * @param {string} spell.cntUtxoId - "txHash:outputIndex" of CNT UTXO
 * @param {string} spell.fundingUtxoId - "txHash:outputIndex" of ADA funding
 * @param {number} spell.beamAmount - Raw token units to beam out
 * @param {number} spell.changeAmount - Raw token units to keep as change (0 = no change)
 * @param {string} spell.beamToHash - SHA256 hash of BTC placeholder utxo_id
 * @param {string} spell.cardanoAddress - Bech32 address for change output
 * @returns {Promise<{ normalizedSpellHex: string, appPrivateInputs: object }>}
 */
export async function normalizeCardanoBeamOutSpell(spell) {
  const {
    tokenAppId, cntUtxoId, fundingUtxoId,
    beamAmount, changeAmount, beamToHash, cardanoAddress,
  } = spell;

  const addrBytes = await cardanoAddressToRawBytes(cardanoAddress);

  // App public inputs
  const appPublicInputs = new Map();
  appPublicInputs.set(appToCborTuple(tokenAppId), null);

  // Outputs: [beamed, change] or [beamed]
  const outs = [new Map([[0, beamAmount]])];
  if (changeAmount > 0) outs.push(new Map([[0, changeAmount]]));

  // beamed_outs: { 0: beamToHash_bytes }
  const beamToBytes = [];
  for (let i = 0; i < 64; i += 2) {
    beamToBytes.push(parseInt(beamToHash.substring(i, i + 2), 16));
  }
  const beamedOuts = new Map();
  beamedOuts.set(0, beamToBytes);

  // Coins: Cardano outputs with raw address bytes
  const coins = [
    { amount: 2000000, dest: addrBytes },
  ];
  if (changeAmount > 0) {
    coins.push({ amount: 2000000, dest: addrBytes });
  }

  const normalizedSpell = {
    version: 13,
    tx: {
      ins: [utxoIdToBytes(cntUtxoId), utxoIdToBytes(fundingUtxoId)],
      outs,
      beamed_outs: beamedOuts,
      coins,
    },
    app_public_inputs: appPublicInputs,
  };

  return {
    normalizedSpellHex: cborToHex(normalizedSpell),
    appPrivateInputs: { [tokenAppId]: 'f6' },
  };
}

/**
 * Normalize a Bitcoin claim spell (ADA → BTC claim).
 *
 * @param {object} spell
 * @param {string} spell.tokenAppId - "t/identity/vk"
 * @param {string} spell.btcPlaceholderUtxoId - "txid:vout" of BTC placeholder
 * @param {string} spell.btcFundingUtxoId - "txid:vout" of BTC funding UTXO
 * @param {number} spell.beamAmount - Raw token units
 * @param {string} spell.cardanoBeamOutTxid - "txid:vout" of Cardano beam-out UTXO
 * @param {string} spell.btcDestAddress - Bitcoin dest address (bech32)
 * @returns {Promise<{ normalizedSpellHex: string, appPrivateInputs: object, txInsBeamedSourceUtxos: object }>}
 */
export async function normalizeBtcClaimSpell(spell) {
  const {
    tokenAppId, btcPlaceholderUtxoId, btcFundingUtxoId,
    beamAmount, cardanoBeamOutTxid, btcDestAddress,
  } = spell;

  // BTC scriptPubKey from bech32 address
  const bitcoin = await import('bitcoinjs-lib');
  const scriptPubkey = Array.from(bitcoin.address.toOutputScript(btcDestAddress));

  const appPublicInputs = new Map();
  appPublicInputs.set(appToCborTuple(tokenAppId), null);

  const normalizedSpell = {
    version: 13,
    tx: {
      ins: [
        utxoIdToBytes(btcPlaceholderUtxoId),
        utxoIdToBytes(btcFundingUtxoId),
      ],
      outs: [new Map([[0, beamAmount]])],
      coins: [
        { amount: 546, dest: scriptPubkey },
      ],
    },
    app_public_inputs: appPublicInputs,
  };

  return {
    normalizedSpellHex: cborToHex(normalizedSpell),
    appPrivateInputs: { [tokenAppId]: 'f6' },
    txInsBeamedSourceUtxos: { 0: [cardanoBeamOutTxid, null] },
  };
}
