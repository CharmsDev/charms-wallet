/**
 * Transaction Hex Fetcher
 * Fetches raw transaction hex needed for prev_txs in the prover payload.
 * Uses Explorer API first, then mempool.space as fallback.
 */

import { EXPLORER_API, getMempoolBase, getExplorerNetworkParam } from './constants.js';

async function fetchViaExplorer(txid, network) {
  const networkParam = getExplorerNetworkParam(network);
  const url = `${EXPLORER_API}/v1/wallet/tx/${txid}?network=${networkParam}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Explorer ${res.status}`);
  const data = await res.json();
  // Explorer returns verbose tx — we need the raw hex
  if (data?.hex) return data.hex;
  throw new Error('Explorer returned no hex');
}

async function fetchViaMempool(txid, network) {
  const base = getMempoolBase(network);
  const res = await fetch(`${base}/tx/${txid}/hex`);
  if (!res.ok) throw new Error(`Mempool ${res.status}`);
  const hex = await res.text();
  if (!hex || hex.length < 10) throw new Error('Mempool returned empty hex');
  return hex.trim();
}

/**
 * Fetch raw tx hex for a txid, trying Explorer API then mempool.space.
 * @param {string} txid
 * @param {string} network  'mainnet' | 'testnet4'
 * @returns {string} raw hex
 */
export async function fetchTxHex(txid, network) {
  // Try Explorer first
  try {
    return await fetchViaExplorer(txid, network);
  } catch (e) {
    console.warn(`[TxFetcher] Explorer failed for ${txid}: ${e.message}`);
  }
  // Fallback to mempool.space
  return await fetchViaMempool(txid, network);
}

/**
 * Fetch hex for all unique txids in a list of spell inputs.
 * @param {Array<{utxo_id: string}>} spellIns
 * @param {string} network
 * @returns {Map<string, string>} txid → hex
 */
export async function fetchPrevTxs(spellIns, network) {
  const txids = [...new Set(spellIns.map(i => i.utxo_id.split(':')[0]))];
  const map = new Map();
  await Promise.all(txids.map(async txid => {
    const hex = await fetchTxHex(txid, network);
    map.set(txid, hex);
  }));
  return map;
}
