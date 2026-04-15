/**
 * Blockfrost Cardano API provider.
 * Requires API key (free tier: 50k req/day).
 */

import config from '@/config';

function getBaseUrl() {
  return config.cardano.getBlockfrostApiUrl();
}

function headers() {
  return {
    'Content-Type': 'application/json',
    project_id: config.cardano.blockfrostProjectId || '',
  };
}

export function isConfigured() {
  const id = config.cardano.blockfrostProjectId;
  return id && id !== 'your_blockfrost_project_id_here';
}

export async function fetchUtxos(address) {
  const resp = await fetch(`${getBaseUrl()}/addresses/${address}/utxos`, { headers: headers() });
  if (resp.status === 404 || resp.status === 403) return [];
  if (!resp.ok) throw new Error(`Blockfrost UTXOs: ${resp.status}`);
  const data = await resp.json();

  return data.map(u => {
    const lovelace = u.amount.find(a => a.unit === 'lovelace')?.quantity || '0';
    const assets = u.amount
      .filter(a => a.unit !== 'lovelace')
      .map(a => ({ unit: a.unit, quantity: a.quantity }));
    return {
      txHash: u.tx_hash,
      outputIndex: u.tx_index ?? u.output_index,
      lovelace,
      assets,
    };
  });
}

export async function fetchAddressSummary(address) {
  const resp = await fetch(`${getBaseUrl()}/addresses/${address}`, { headers: headers() });
  if (resp.status === 404 || resp.status === 403) return null;
  if (!resp.ok) throw new Error(`Blockfrost address: ${resp.status}`);
  const data = await resp.json();

  const lovelace = data.amount?.find(a => a.unit === 'lovelace')?.quantity || '0';
  const assets = (data.amount || []).filter(a => a.unit !== 'lovelace');
  return { lovelace, assets };
}

export async function fetchAssetMeta(unit) {
  const resp = await fetch(`${getBaseUrl()}/assets/${unit}`, { headers: headers() });
  if (resp.status === 404 || resp.status === 403) return null;
  if (!resp.ok) return null;
  const data = await resp.json();

  const onchain = data.onchain_metadata || {};
  const meta = data.metadata || {};

  return {
    unit,
    policyId: data.policy_id,
    assetName: data.asset_name,
    fingerprint: data.fingerprint,
    name: onchain.name || meta.name || hexToAscii(data.asset_name) || unit.slice(0, 16),
    ticker: meta.ticker || onchain.ticker || '',
    decimals: meta.decimals ?? 0,
    image: onchain.image || meta.logo || '',
    description: onchain.description || meta.description || '',
    totalSupply: data.quantity,
  };
}

export async function submitTx(txCbor) {
  const resp = await fetch(`${getBaseUrl()}/tx/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/cbor', project_id: config.cardano.blockfrostProjectId || '' },
    body: txCbor,
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Blockfrost submit: ${resp.status} ${body}`);
  }
  return resp.json();
}

export async function fetchAddressTxs(address, count = 20) {
  const resp = await fetch(
    `${getBaseUrl()}/addresses/${address}/transactions?count=${count}&order=desc`,
    { headers: headers() },
  );
  if (resp.status === 404 || resp.status === 403) return [];
  if (!resp.ok) throw new Error(`Blockfrost txs: ${resp.status}`);
  return resp.json();
}

function hexToAscii(hex) {
  if (!hex) return '';
  try {
    let str = '';
    for (let i = 0; i < hex.length; i += 2) {
      const code = parseInt(hex.substr(i, 2), 16);
      if (code >= 32 && code < 127) str += String.fromCharCode(code);
    }
    return str || '';
  } catch { return ''; }
}
