/**
 * Transaction Broadcaster
 *
 * 2-tier failover: Explorer API → mempool.space
 * Explorer API is primary because it supports large OP_RETURN (charms proof data).
 *
 * After every successful broadcast we reserve the tx inputs in the in-memory
 * UTXO reservation set so any concurrent op (BTC send, charm transfer, beam,
 * redeem) running in the same session can't double-spend the same UTXO before
 * the tx confirms. Reservations auto-clear on the next chain refresh via
 * `syncWithChain`.
 */

import { EXPLORER_API, getMempoolBase, getExplorerNetworkParam } from './constants.js';

/** Parse the inputs of a signed raw tx and mark each as reserved. Failures
 *  are swallowed — the broadcast already succeeded and the reservation
 *  layer is best-effort defence in depth, not a correctness guarantee. */
async function reserveInputs(rawTxHex) {
  try {
    const bitcoin = await import('bitcoinjs-lib');
    const tx = bitcoin.Transaction.fromHex(rawTxHex);
    const items = tx.ins.map(inp => ({
      txid: Buffer.from(inp.hash).reverse().toString('hex'),
      vout: inp.index,
    }));
    if (!items.length) return;
    const { markBatch } = await import('@/services/utxo-reservations');
    const n = markBatch('bitcoin', items);
    console.log(`[Broadcaster] reserved ${n}/${items.length} inputs from broadcast tx`);
  } catch (e) {
    console.warn('[Broadcaster] reserveInputs failed (non-fatal):', e?.message || e);
  }
}

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
    if (res.ok && data?.txid) {
      await reserveInputs(rawTxHex);
      return data.txid;
    }
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
  await reserveInputs(rawTxHex);
  return text.trim();
}
