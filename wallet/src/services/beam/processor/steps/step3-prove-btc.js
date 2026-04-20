/**
 * Step 3: Build beam spell, normalize, fetch prev txs, call prover.
 *
 * Input:  tokenAppId, charmInputs, fundingUtxo, beamAmount, placeholderTxid, placeholderVout, btcChangeAddress, network
 * Output: { spellTxHex, prevTxMap }
 */

import { utxoIdHash } from '../../core/crypto';
import { buildBeamSpell } from '../../spells/builder';
import { normalizeBeamSpell } from '../../spells/normalizer';
import { buildProverPayload, submitToProver } from '../../spells/payload';
import { fetchFeeRate } from '../../chains/bitcoin/fee';
import { fetchPrevTxs, fetchTxHex } from '@/services/charm-transfer/tx-fetcher';

export async function proveBtcBeam({
  tokenAppId, charmInputs, fundingUtxo, beamAmount,
  placeholderTxid, placeholderVout,
  btcChangeAddress, network, onStatus,
}) {
  onStatus?.('Computing beam commitment hash...');
  const beamToHash = await utxoIdHash(placeholderTxid, placeholderVout);

  onStatus?.('Building beam spell...');
  const spell = buildBeamSpell({
    tokenAppId, charmInputs, fundingUtxo, beamAmount,
    beamToHash, changeAddress: btcChangeAddress,
  });

  const { normalizedSpellHex, appPrivateInputs, txInsBeamedSourceUtxos } = normalizeBeamSpell(spell);

  onStatus?.('Fetching input transactions...');
  const prevTxMap = await fetchPrevTxs(spell.ins, network);
  const prevTxs = spell.ins.map(inp => {
    const txid = inp.utxo_id.split(':')[0];
    const hex = prevTxMap.get(txid);
    if (!hex) throw new Error(`Missing tx hex for ${txid}`);
    return { bitcoin: hex };
  });

  const feeRate = await fetchFeeRate(network);

  const payload = buildProverPayload({
    normalizedSpellHex, appPrivateInputs, txInsBeamedSourceUtxos,
    prevTxs, changeAddress: btcChangeAddress, feeRate,
  });

  onStatus?.('Generating ZK proof (5-10 min)...');
  const spellTxHex = await submitToProver(payload, network, onStatus);

  // Fetch extra prev_txs if prover added inputs
  const bitcoin = await import('bitcoinjs-lib');
  const spellTx = bitcoin.Transaction.fromHex(spellTxHex);
  for (const inp of spellTx.ins) {
    const txid = Buffer.from(inp.hash).reverse().toString('hex');
    if (!prevTxMap.has(txid)) {
      const hex = await fetchTxHex(txid, network);
      prevTxMap.set(txid, hex);
    }
  }

  return { spellTxHex, prevTxMap };
}
