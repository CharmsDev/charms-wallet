/**
 * Beam Prover Payload Builder.
 *
 * Composes the full payload for the prover API from normalized spell data.
 * Isolated from spell building — only handles API formatting.
 */

import { getProverUrl } from '@/services/charm-transfer/constants';

/**
 * Build the prover API payload for a beam spell.
 *
 * @param {object} p
 * @param {string} p.normalizedSpellHex - CBOR hex of normalized spell
 * @param {object} p.appPrivateInputs   - { appId: hexCborValue }
 * @param {object} p.txInsBeamedSourceUtxos - {} for beam out
 * @param {Array<{ bitcoin: string }>} p.prevTxs - Previous tx hex values
 * @param {string} p.changeAddress      - BTC change address
 * @param {number} p.feeRate            - sat/vB
 * @returns {object} Prover API payload
 */
export function buildProverPayload({
  normalizedSpellHex,
  appPrivateInputs,
  txInsBeamedSourceUtxos,
  prevTxs,
  changeAddress,
  feeRate,
}) {
  return {
    spell: normalizedSpellHex,
    app_private_inputs: appPrivateInputs,
    tx_ins_beamed_source_utxos: txInsBeamedSourceUtxos,
    binaries: {},
    prev_txs: prevTxs,
    change_address: changeAddress,
    fee_rate: feeRate,
    chain: 'bitcoin',
    collateral_utxo: null,
  };
}

/**
 * Send payload to prover and get unsigned transaction back.
 *
 * @param {object} payload   - From buildProverPayload
 * @param {string} network   - 'mainnet' | 'testnet4'
 * @param {function} [onStatus] - Status callback
 * @returns {Promise<string>} Unsigned transaction hex
 */
export async function submitToProver(payload, network, onStatus) {
  // getProverUrl already includes /spells/prove
  const url = getProverUrl(network);

  onStatus?.('Sending to prover...');

  // Dump payload for debugging
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    fetch('/api/debug-dump', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: `beam-payload-${ts}.json`, data: payload }),
    }).catch(() => {});
  } catch {}

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

      // Response: [{ bitcoin: "raw_tx_hex" }]
      const txHex = Array.isArray(result) ? result[0]?.bitcoin : result?.bitcoin;
      if (!txHex) throw new Error('Prover returned no transaction');

      return txHex;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        onStatus?.(`Prover attempt ${attempt} failed, retrying...`);
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
  }

  throw lastError;
}
