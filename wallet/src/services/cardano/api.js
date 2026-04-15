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

// ── Public API (same interface for all consumers) ───────────────────────────

export async function fetchUtxos(address) {
  return withFallback(
    () => blockfrost.fetchUtxos(address),
    () => koios.fetchUtxos(address, getNetwork()),
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

export async function submitCardanoTx(txCbor) {
  return withFallback(
    () => blockfrost.submitTx(txCbor),
    () => koios.submitTx(txCbor, getNetwork()),
  );
}

export async function fetchAddressTxs(address, count = 20) {
  return withFallback(
    () => blockfrost.fetchAddressTxs(address, count),
    () => koios.fetchAddressTxs(address, getNetwork(), count),
  );
}

/**
 * Fetch raw CBOR hex of a Cardano transaction.
 */
export async function getCardanoTxCbor(txHash) {
  const resp = await fetch('/api/cardano', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'koios', network: getNetwork(),
      endpoint: '/tx_cbor', method: 'POST',
      body: { _tx_hashes: [txHash] },
    }),
  });
  if (!resp.ok) throw new Error(`Failed to fetch tx CBOR: ${resp.status}`);
  const data = await resp.json();
  if (!data?.[0]?.cbor) throw new Error(`No CBOR for tx ${txHash}`);
  return data[0].cbor;
}

export async function getCardanoTx(txHash) {
  return withFallback(
    () => blockfrost.fetchTxDetail?.(txHash) ?? Promise.resolve(null),
    async () => {
      const resp = await fetch('/api/cardano', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'koios', network: getNetwork(),
          endpoint: '/tx_info', method: 'POST',
          body: { _tx_hashes: [txHash] },
        }),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      return data[0] || null;
    },
  );
}

export async function getProtocolParams() {
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
      const resp = await fetch('/api/cardano', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'koios', network: getNetwork(),
          endpoint: '/epoch_params?limit=1', method: 'GET',
        }),
      });
      if (!resp.ok) throw new Error(`Koios params: ${resp.status}`);
      const data = await resp.json();
      return Array.isArray(data) ? data[0] || {} : data;
    },
  );
}
