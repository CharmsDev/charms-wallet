/**
 * Beam Spell Builder.
 *
 * Builds a human-friendly beam spell object for BTC→ADA transfers.
 * Pure function — no API calls, no side effects.
 *
 * Key difference from transfer spells: one output has `beam_to` instead of an address.
 * The beamed output carries tokens cross-chain; it has no Bitcoin address.
 */

import { SPELL_VERSION, CHARM_DUST } from '@/services/charm-transfer/constants';

/**
 * Build a beam-out spell (BTC → another chain).
 *
 * @param {object} p
 * @param {string}   p.tokenAppId      - e.g. "t/3d7fe.../c975d4..."
 * @param {Array<{utxoId:string, amount:number}>} p.charmInputs - charm UTXOs to spend
 * @param {{utxoId:string, value:number}} p.fundingUtxo  - plain BTC UTXO for fees
 * @param {number}   p.beamAmount      - raw token units to beam
 * @param {string}   p.beamToHash      - SHA256 hex of destination placeholder UTXO
 * @param {string}   p.changeAddress   - BTC address for remaining tokens
 * @returns {object} spell object (human-friendly, not yet normalized)
 */
export function buildBeamSpell({
  tokenAppId,
  charmInputs,
  fundingUtxo,
  beamAmount,
  beamToHash,
  changeAddress,
}) {
  if (!charmInputs?.length) throw new Error('At least one charm input required');
  if (!fundingUtxo?.utxoId)  throw new Error('Funding UTXO required');
  if (!beamToHash)           throw new Error('beam_to hash required');
  if (beamAmount <= 0)       throw new Error('Beam amount must be > 0');

  const apps = { '$00': tokenAppId };

  // Charm inputs first, funding last
  const ins = [
    ...charmInputs.map(ci => ({ utxo_id: ci.utxoId })),
    { utxo_id: fundingUtxo.utxoId },
  ];

  const outs = [];

  // Output 0: beamed tokens — has beam_to AND a BTC address (required by prover)
  if (!changeAddress) throw new Error('Change address required for beam output');
  outs.push({
    address: changeAddress,
    coin: CHARM_DUST,
    charms: { '$00': beamAmount },
    beam_to: beamToHash,
  });

  // Output 1 (optional): remaining tokens → sender on BTC
  const totalInputTokens = charmInputs.reduce((sum, ci) => sum + ci.amount, 0);
  const remaining = totalInputTokens - beamAmount;
  if (remaining > 0) {
    if (!changeAddress) throw new Error('Change address required for partial beam');
    outs.push({
      address: changeAddress,
      coin: CHARM_DUST,
      charms: { '$00': remaining },
    });
  }

  return {
    version: SPELL_VERSION,
    apps,
    ins,
    outs,
    private_inputs: { '$00': null },
  };
}
