/**
 * Claim Prover Payload Builder.
 *
 * Builds the payload for the prover API when claiming beamed tokens on Cardano.
 * Key differences from Bitcoin payload:
 * - chain: 'cardano'
 * - collateral_utxo: required (Cardano Plutus tx needs collateral)
 * - tx_ins_beamed_source_utxos: maps input index → source BTC UTXO
 * - prev_txs: includes the Bitcoin beam-out tx (as { bitcoin: hex }) for finality verification
 */

import { getProverUrl } from '@/services/charm-transfer/constants';

/**
 * Build the Cardano claim prover payload.
 *
 * @param {object} p
 * @param {string} p.normalizedSpellHex
 * @param {object} p.appPrivateInputs
 * @param {object} p.txInsBeamedSourceUtxos - { 0: "btcTxid:vout" }
 * @param {Array}  p.prevTxs                - Previous txs (Bitcoin beam-out with finality proof)
 * @param {string} p.changeAddress          - Cardano change address
 * @param {number} p.feeRate                - Not used for Cardano but required by API
 * @param {string} p.collateralUtxo         - Cardano UTXO for Plutus collateral "txHash:index"
 * @returns {object}
 */
export function buildClaimPayload({
  normalizedSpellHex,
  appPrivateInputs,
  txInsBeamedSourceUtxos,
  binaries,
  prevTxs,
  changeAddress,
  feeRate,
  collateralUtxo,
}) {
  return {
    spell: normalizedSpellHex,
    app_private_inputs: appPrivateInputs,
    tx_ins_beamed_source_utxos: txInsBeamedSourceUtxos,
    binaries: binaries || {},
    prev_txs: prevTxs,
    change_address: changeAddress,
    fee_rate: feeRate || 0,
    chain: 'cardano',
    collateral_utxo: collateralUtxo,
  };
}

/**
 * Submit claim payload to prover.
 * Same prover endpoint, different chain parameter.
 *
 * @param {object}   payload
 * @param {string}   network   - 'mainnet' | 'testnet4'
 * @param {function} [onStatus]
 * @returns {Promise<string>} Signed Cardano tx CBOR hex
 */
export async function submitClaimToProver(payload, network, onStatus) {
  // getProverUrl already includes /spells/prove
  const url = getProverUrl(network);
  onStatus?.('Sending claim to prover...');

  const MAX_RETRIES = 3;
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new Error(`Prover error ${resp.status}: ${body}`);
      }

      const result = await resp.json();

      // Response: [{ cardano: "signed_tx_cbor_hex" }]
      const txHex = Array.isArray(result) ? result[0]?.cardano : result?.cardano;
      if (!txHex) throw new Error('Prover returned no Cardano transaction');

      return txHex;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        onStatus?.(`Claim attempt ${attempt} failed, retrying...`);
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
  }

  throw lastError;
}
