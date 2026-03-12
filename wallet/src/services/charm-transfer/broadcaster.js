/**
 * Transaction Broadcaster
 *
 * 2-tier failover: Explorer API → mempool.space
 * Explorer API is primary because it supports large OP_RETURN (charms proof data).
 */

import { EXPLORER_API, getMempoolBase, getExplorerNetworkParam } from './constants.js';

/**
 * Broadcast a signed raw transaction.
 * @param {string} rawTxHex  Signed raw TX hex
 * @param {string} network   'mainnet' | 'testnet4'
 * @returns {string} txid
 */
export async function broadcastTx(rawTxHex, network) {
  // Tier 1: Explorer API (supports large OP_RETURN from charms proof)
  try {
    const param = getExplorerNetworkParam(network);
    const res = await fetch(`${EXPLORER_API}/v1/wallet/broadcast?network=${param}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_tx: rawTxHex }),
    });
    const data = await res.json();
    if (res.ok && data?.txid) return data.txid;
    throw new Error(data?.error || `Explorer broadcast HTTP ${res.status}`);
  } catch (e) {
    console.warn('[Broadcaster] Explorer failed, trying mempool:', e.message);
  }

  // Tier 2: mempool.space
  const base = getMempoolBase(network);
  const res = await fetch(`${base}/tx`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: rawTxHex,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Mempool broadcast failed: ${text.slice(0, 200)}`);
  return text.trim();
}
