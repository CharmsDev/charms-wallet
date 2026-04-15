/**
 * Bitcoin finality proof fetcher.
 *
 * After 6 confirmations, fetches the Merkle proof and block headers
 * needed to construct BitcoinTx::WithBlockProof for the Cardano prover.
 *
 * The prover expects prev_txs to include the Bitcoin beam-out tx
 * as a BitcoinTx::WithBlockProof variant (tx + proof + 6 headers).
 */

import { getMempoolBase, EXPLORER_API, getExplorerNetworkParam } from '@/services/charm-transfer/constants';

/**
 * Fetch Bitcoin tx with finality proof (Merkle proof + block headers).
 *
 * @param {string} txid    - Bitcoin transaction ID
 * @param {string} network - 'mainnet' | 'testnet4'
 * @returns {Promise<string>} - Hex-encoded serialized BitcoinTx::WithBlockProof
 */
export async function fetchBtcTxWithProof(txid, network) {
  // Try Explorer API first — it may have a dedicated proof endpoint
  try {
    const netParam = getExplorerNetworkParam(network);
    const resp = await fetch(
      `${EXPLORER_API}/v1/wallet/tx/${txid}/with-proof?network=${netParam}`
    );
    if (resp.ok) {
      const data = await resp.json();
      if (data?.hex_with_proof) return data.hex_with_proof;
    }
  } catch { /* fallback */ }

  // Fallback: fetch raw tx + Merkle proof + headers separately from mempool
  const base = getMempoolBase(network);

  // 1. Raw tx hex
  const txResp = await fetch(`${base}/tx/${txid}/hex`);
  if (!txResp.ok) throw new Error(`Failed to fetch tx ${txid}`);
  const txHex = (await txResp.text()).trim();

  // 2. Merkle proof
  const proofResp = await fetch(`${base}/tx/${txid}/merkleblock-proof`);
  if (!proofResp.ok) throw new Error(`Failed to fetch Merkle proof for ${txid}`);
  const proofHex = (await proofResp.text()).trim();

  // 3. Block hash for the tx
  const txDataResp = await fetch(`${base}/tx/${txid}`);
  if (!txDataResp.ok) throw new Error(`Failed to fetch tx data for ${txid}`);
  const txData = await txDataResp.json();
  const blockHash = txData.status?.block_hash;
  if (!blockHash) throw new Error(`Tx ${txid} not yet confirmed`);
  const blockHeight = txData.status?.block_height;

  // 4. Fetch 6 subsequent block headers
  const headers = [];
  for (let h = blockHeight + 1; h <= blockHeight + 6; h++) {
    const hashResp = await fetch(`${base}/block-height/${h}`);
    if (!hashResp.ok) throw new Error(`Failed to fetch block hash at height ${h}`);
    const bHash = (await hashResp.text()).trim();

    const headerResp = await fetch(`${base}/block/${bHash}/header`);
    if (!headerResp.ok) throw new Error(`Failed to fetch block header for ${bHash}`);
    const headerHex = (await headerResp.text()).trim();
    headers.push(headerHex);
  }

  // Return as structured object — the prover payload serializer will handle encoding
  return { txHex, proofHex, headers };
}
