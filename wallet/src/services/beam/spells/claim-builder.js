/**
 * Beam Claim Spell Builder.
 *
 * Builds the Cardano-side spell that claims beamed tokens from Bitcoin.
 * This spell has `beamed_from` on its input — referencing the BTC beam-out UTXO.
 *
 * The prover API with `chain: 'cardano'` handles:
 * - Proof generation (SP1 zkVM)
 * - Cardano tx building (PlutusV3 proxy scripts, CNT minting)
 * - Scrolls ICP canister signature (finality certification)
 */

import { SPELL_VERSION } from '@/services/charm-transfer/constants';

// Cardano min UTXO for output with tokens (~1.3 ADA). Use 2 ADA for safety.
const CARDANO_MIN_UTXO_LOVELACE = 2_000_000;

/**
 * Build a claim spell for the Cardano side of a BTC→ADA beam.
 *
 * @param {object} p
 * @param {string}   p.tokenAppId         - e.g. "t/3d7fe.../c975d4..."
 * @param {string}   p.placeholderUtxoId  - Cardano placeholder UTXO "txHash:outputIndex"
 * @param {string}   p.btcBeamTxid        - Bitcoin beam-out tx ID
 * @param {number}   p.btcBeamVout        - Bitcoin beam-out output index (usually 0)
 * @param {number}   p.claimAmount        - Raw token units to claim
 * @param {string}   p.cardanoAddress     - Destination Cardano address (bech32)
 * @param {string}   [p.fundingUtxoId]   - Cardano funding UTXO "txHash:outputIndex" (pure ADA for fees)
 * @returns {object} { spell, beamedFrom }
 */
export function buildClaimSpell({
  tokenAppId,
  placeholderUtxoId,
  btcBeamTxid,
  btcBeamVout,
  claimAmount,
  cardanoAddress,
  fundingUtxoId,
}) {
  if (!placeholderUtxoId)  throw new Error('Placeholder UTXO ID required');
  if (!btcBeamTxid)        throw new Error('Bitcoin beam tx ID required');
  if (claimAmount <= 0)    throw new Error('Claim amount must be > 0');

  const apps = { '$00': tokenAppId };

  // Input 0: placeholder UTXO (has no charms — it's just a marker)
  // Input 1: funding UTXO (pure ADA to cover fees + output min ADA)
  const ins = [
    { utxo_id: placeholderUtxoId, beamed_from: `${btcBeamTxid}:${btcBeamVout}` },
  ];
  if (fundingUtxoId) {
    ins.push({ utxo_id: fundingUtxoId });
  }

  // Output: claimed tokens at the Cardano destination address
  // Cardano needs min ~1.3 ADA for outputs with tokens; use 2 ADA for safety
  const outs = [
    {
      address: cardanoAddress,
      coin: CARDANO_MIN_UTXO_LOVELACE,
      charms: { '$00': claimAmount },
    },
  ];

  const spell = {
    version: SPELL_VERSION,
    apps,
    ins,
    outs,
    private_inputs: { '$00': null },
  };

  // beamedFrom mapping: input index → source UTXO on the other chain
  // This is passed separately as tx_ins_beamed_source_utxos to the prover
  const beamedFrom = {
    0: `${btcBeamTxid}:${btcBeamVout}`,
  };

  return { spell, beamedFrom };
}
