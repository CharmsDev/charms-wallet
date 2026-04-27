/**
 * Cardano API Router.
 *
 * Multi-provider with automatic fallback:
 *   1. Blockfrost (if configured) — fast, reliable, needs API key
 *   2. Koios (always available) — free, public, no key needed
 *
 * All functions return the same data shape regardless of provider.
 * Adding a new provider = create providers/<name>.js with same exports.
 */

import * as blockfrost from './providers/blockfrost';
import * as koios from './providers/koios';
import config from '@/config';

function getNetwork() {
  if (typeof window !== 'undefined') {
    const blockchain = localStorage.getItem('wallet:active_blockchain');
    const stored = localStorage.getItem('wallet:active_network');

    // If Cardano is active, use its network directly
    if (blockchain === 'cardano' && (stored === 'mainnet' || stored === 'preprod')) return stored;

    // If Bitcoin is active, map to equivalent Cardano network
    if (blockchain === 'bitcoin') return stored === 'mainnet' ? 'mainnet' : 'preprod';
  }
  return config.cardano.network || 'preprod';
}

/**
 * Try Blockfrost first, fall back to Koios.
 */
async function withFallback(blockfrostFn, koiosFn) {
  if (blockfrost.isConfigured()) {
    try {
      return await blockfrostFn();
    } catch (err) {
      console.warn('[Cardano] Blockfrost failed, trying Koios:', err.message);
    }
  }
  return koiosFn();
}

/**
 * Route a Koios call through the wallet's proxy endpoint. Returns null on
 * non-OK responses (callers decide how to treat 4xx vs throw).
 */
async function koiosProxy(endpoint, body, { method = 'POST', network } = {}) {
  const resp = await fetch('/api/cardano', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'koios',
      network: network || getNetwork(),
      endpoint,
      method,
      body,
    }),
  });
  if (!resp.ok) return { ok: false, status: resp.status };
  return { ok: true, data: await resp.json() };
}

// ── Public API (same interface for all consumers) ───────────────────────────

export async function fetchUtxos(address, network) {
  const net = network || getNetwork();
  return withFallback(
    () => blockfrost.fetchUtxos(address),
    () => koios.fetchUtxos(address, net),
  );
}

export async function fetchAddressSummary(address) {
  return withFallback(
    () => blockfrost.fetchAddressSummary(address),
    () => koios.fetchAddressSummary(address, getNetwork()),
  );
}

export async function fetchAssetMeta(unit) {
  return withFallback(
    () => blockfrost.fetchAssetMeta(unit),
    () => koios.fetchAssetMeta(unit, getNetwork()),
  );
}

export async function submitCardanoTx(txCbor, network) {
  const net = network || getNetwork();
  return withFallback(
    () => blockfrost.submitTx(txCbor),
    () => koios.submitTx(txCbor, net),
  );
}

export async function fetchAddressTxs(address, count = 20) {
  return withFallback(
    () => blockfrost.fetchAddressTxs(address, count),
    () => koios.fetchAddressTxs(address, getNetwork(), count),
  );
}

/** Fetch raw CBOR hex of a Cardano transaction. */
export async function getCardanoTxCbor(txHash, network) {
  const res = await koiosProxy('/tx_cbor', { _tx_hashes: [txHash] }, { network });
  if (!res.ok) throw new Error(`Failed to fetch tx CBOR: ${res.status}`);
  if (!res.data?.[0]?.cbor) throw new Error(`No CBOR for tx ${txHash}`);
  return res.data[0].cbor;
}

/** Fetch a single tx_info; returns null if not found. */
export async function getCardanoTx(txHash, network) {
  const res = await koiosProxy('/tx_info', { _tx_hashes: [txHash] }, { network });
  if (!res.ok) return null;
  return res.data?.[0] || null;
}

/**
 * Batch-fetch tx_info details for many hashes in a single Koios call. Koios
 * accepts up to ~50 hashes per request. Returns a map {hash: detail}.
 */
export async function getCardanoTxsBatch(txHashes, network) {
  if (!txHashes?.length) return {};
  const res = await koiosProxy('/tx_info', {
    _tx_hashes: txHashes, _inputs: true, _assets: true,
  }, { network });
  if (!res.ok) return {};
  const out = {};
  for (const tx of Array.isArray(res.data) ? res.data : []) {
    if (tx.tx_hash) out[tx.tx_hash] = tx;
  }
  return out;
}

export async function getProtocolParams(network) {
  const net = network || getNetwork();
  return withFallback(
    async () => {
      const resp = await fetch(
        `${config.cardano.getBlockfrostApiUrl()}/epochs/latest/parameters`,
        { headers: { project_id: config.cardano.blockfrostProjectId, 'Content-Type': 'application/json' } }
      );
      if (!resp.ok) throw new Error(`Blockfrost params: ${resp.status}`);
      return resp.json();
    },
    async () => {
      const res = await koiosProxy('/epoch_params?limit=1', null, { method: 'GET', network: net });
      if (!res.ok) throw new Error(`Koios params: ${res.status}`);
      return Array.isArray(res.data) ? res.data[0] || {} : res.data;
    },
  );
}
