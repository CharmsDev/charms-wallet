/**
 * Koios Cardano API provider.
 * Free, public, no API key required.
 * Calls go through /api/cardano proxy to avoid CORS.
 */

/** Parse CIP-68 metadata from Koios asset_info response. */
function parseCip68Metadata(cip68) {
  if (!cip68) return {};
  // CIP-68 label 333 = fungible token metadata
  const fields = cip68['333']?.fields || cip68['222']?.fields || [];
  if (!fields.length) return {};
  const metaMap = fields[0]?.map;
  if (!Array.isArray(metaMap)) return {};
  const result = {};
  for (const entry of metaMap) {
    try {
      const key = Buffer.from(entry.k.bytes, 'hex').toString('utf-8');
      if ('bytes' in entry.v) {
        result[key] = Buffer.from(entry.v.bytes, 'hex').toString('utf-8');
      } else if ('int' in entry.v) {
        result[key] = entry.v.int;
      }
    } catch { /* skip malformed entries */ }
  }
  return result;
}

async function proxy(network, endpoint, body) {
  const resp = await fetch('/api/cardano', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'koios', network, endpoint, method: 'POST', body }),
  });
  if (!resp.ok) return null;
  return resp.json();
}

export async function fetchUtxos(address, network) {
  const data = await proxy(network, '/address_utxos', { _addresses: [address], _extended: true });
  if (!data || !Array.isArray(data)) return [];

  return data.map(u => {
    const lovelace = u.value || '0';
    const assets = (u.asset_list || []).map(a => ({
      unit: a.policy_id + a.asset_name,
      quantity: a.quantity,
    }));
    return {
      txHash: u.tx_hash,
      outputIndex: u.tx_index,
      lovelace,
      assets,
    };
  });
}

export async function fetchAddressSummary(address, network) {
  const data = await proxy(network, '/address_info', { _addresses: [address] });
  if (!data || !Array.isArray(data) || !data.length) return null;

  const info = data[0];
  const lovelace = info.balance || '0';
  const assets = (info.utxo_set || []).flatMap(u =>
    (u.asset_list || []).map(a => ({
      unit: a.policy_id + a.asset_name,
      quantity: a.quantity,
    }))
  );
  return { lovelace, assets };
}

export async function fetchAssetMeta(unit, network) {
  const policyId = unit.slice(0, 56);
  const assetName = unit.slice(56);

  const data = await proxy(network, '/asset_info', { _asset_list: [[policyId, assetName]] });
  if (!data || !Array.isArray(data) || !data.length) return null;

  const a = data[0];
  const onchain = a.minting_tx_metadata?.['721']?.[policyId]?.[a.asset_name_ascii] || {};

  // Parse CIP-68 metadata (used by Charms proxy CNTs)
  const cip68 = parseCip68Metadata(a.cip68_metadata);

  return {
    unit,
    policyId,
    assetName,
    fingerprint: a.fingerprint || '',
    name: cip68.name || onchain.name || a.asset_name_ascii || hexToAscii(assetName) || unit.slice(0, 16),
    ticker: cip68.ticker || onchain.ticker || a.ticker || '',
    decimals: cip68.decimals ?? a.token_registry_metadata?.decimals ?? 0,
    image: cip68.logo || cip68.image || onchain.image || a.token_registry_metadata?.logo || '',
    description: cip68.description || onchain.description || a.token_registry_metadata?.description || '',
    totalSupply: a.total_supply || '0',
  };
}

export async function submitTx(txCbor, network) {
  // Convert Uint8Array to hex for proxy CBOR submission
  const hex = txCbor instanceof Uint8Array
    ? Array.from(txCbor).map(b => b.toString(16).padStart(2, '0')).join('')
    : typeof txCbor === 'string' ? txCbor : Buffer.from(txCbor).toString('hex');

  const resp = await fetch('/api/cardano', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'koios', network, endpoint: '/submittx', cbor: hex }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Koios submit: ${resp.status} ${err.error || ''}`);
  }
  return resp.json();
}

export async function fetchAddressTxs(address, network, count = 20) {
  const data = await proxy(network, '/address_txs', { _addresses: [address], _after_block_height: 0 });
  if (!data || !Array.isArray(data)) return [];
  return data.slice(0, count);
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
