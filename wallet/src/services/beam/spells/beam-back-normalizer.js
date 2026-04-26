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

import { SPELL_VERSION } from '@/services/charm-transfer/constants';
import { cborToHex, utxoIdToBytes, appToCborTuple } from '../core/cbor';

async function cardanoAddressToRawBytes(bech32Addr) {
  const { waitForCardanoWasm, getCardanoWasm } = await import('@/lib/cardano/cardanoWasm');
  await waitForCardanoWasm();
  const CSL = getCardanoWasm();
  return Array.from(CSL.Address.from_bech32(bech32Addr).to_bytes());
}

/**
 * Normalize a Cardano beam-out spell (ADA → BTC).
 *
 * Accepts an array of CNT inputs so the spell can balance token math when
 * the user's CNT is fragmented across multiple UTXOs. Single-UTXO callers
 * just pass a 1-element array.
 *
 * @param {object} spell
 * @param {string} spell.tokenAppId - "t/identity/vk"
 * @param {Array<{utxoId:string}>} spell.cntInputs - CNT UTXOs to spend (>=1)
 * @param {string} spell.fundingUtxoId - "txHash:outputIndex" of ADA funding
 * @param {number} spell.beamAmount - Raw token units to beam out
 * @param {number} spell.changeAmount - Raw token units to keep as change (0 = no change)
 * @param {string} spell.beamToHash - SHA256 hash of BTC placeholder utxo_id
 * @param {string} spell.cardanoAddress - Bech32 address for change output
 * @returns {Promise<{ normalizedSpellHex: string, appPrivateInputs: object }>}
 */
export async function normalizeCardanoBeamOutSpell(spell) {
  const {
    tokenAppId, cntInputs, fundingUtxoId,
    beamAmount, changeAmount, beamToHash, cardanoAddress,
  } = spell;

  if (!Array.isArray(cntInputs) || cntInputs.length === 0) {
    throw new Error('normalizeCardanoBeamOutSpell: cntInputs must be a non-empty array');
  }

  const addrBytes = await cardanoAddressToRawBytes(cardanoAddress);

  const appPublicInputs = new Map();
  appPublicInputs.set(appToCborTuple(tokenAppId), null);

  const outs = [new Map([[0, beamAmount]])];
  if (changeAmount > 0) outs.push(new Map([[0, changeAmount]]));

  const beamToBytes = [];
  for (let i = 0; i < 64; i += 2) {
    beamToBytes.push(parseInt(beamToHash.substring(i, i + 2), 16));
  }
  const beamedOuts = new Map();
  beamedOuts.set(0, beamToBytes);

  const coins = outs.map(() => ({ amount: 2_000_000, dest: addrBytes }));

  const ins = [
    ...cntInputs.map(i => utxoIdToBytes(i.utxoId)),
    utxoIdToBytes(fundingUtxoId),
  ];

  const normalizedSpell = {
    version: SPELL_VERSION,
    tx: { ins, outs, beamed_outs: beamedOuts, coins },
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
 * @param {string} spell.placeholderUtxoId - "txid:vout" of BTC placeholder
 * @param {string} spell.btcFundingUtxoId - "txid:vout" of BTC funding UTXO
 * @param {number} spell.beamAmount - Raw token units
 * @param {string} spell.cardanoBeamOutTxid - "txid:vout" of Cardano beam-out UTXO
 * @param {string} spell.btcDestAddress - Bitcoin dest address (bech32)
 * @returns {Promise<{ normalizedSpellHex: string, appPrivateInputs: object, txInsBeamedSourceUtxos: object }>}
 */
export async function normalizeBtcClaimSpell(spell) {
  const {
    tokenAppId, placeholderUtxoId, btcFundingUtxoId,
    beamAmount, cardanoBeamOutTxid, btcDestAddress,
  } = spell;

  // BTC scriptPubKey from bech32 address
  const bitcoin = await import('bitcoinjs-lib');
  const scriptPubkey = Array.from(bitcoin.address.toOutputScript(btcDestAddress));

  const appPublicInputs = new Map();
  appPublicInputs.set(appToCborTuple(tokenAppId), null);

  const normalizedSpell = {
    version: SPELL_VERSION,
    tx: {
      ins: [
        utxoIdToBytes(placeholderUtxoId),
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
