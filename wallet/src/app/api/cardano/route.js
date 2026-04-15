/**
 * Cardano API Proxy — bypasses CORS for Koios/Blockfrost calls.
 *
 * POST /api/cardano
 * Body: { provider, network, endpoint, method, body, cbor }
 *
 * For tx submission, pass `cbor` (hex string) instead of `body`.
 */

import { NextResponse } from 'next/server';

const KOIOS_BASE = {
  mainnet: 'https://api.koios.rest/api/v1',
  preprod: 'https://preprod.koios.rest/api/v1',
};

const BLOCKFROST_BASE = {
  mainnet: 'https://cardano-mainnet.blockfrost.io/api/v0',
  preprod: 'https://cardano-preprod.blockfrost.io/api/v0',
};

export async function POST(request) {
  try {
    const payload = await request.json();
    const { provider = 'koios', network = 'preprod', endpoint, method = 'POST', body, cbor, blockfrostKey } = payload;

    let url;
    if (provider === 'blockfrost') {
      url = `${BLOCKFROST_BASE[network] || BLOCKFROST_BASE.preprod}${endpoint}`;
    } else {
      url = `${KOIOS_BASE[network] || KOIOS_BASE.preprod}${endpoint}`;
    }

    // CBOR submission (tx submit)
    if (cbor) {
      const cborBytes = Buffer.from(cbor, 'hex');
      const headers = { 'Content-Type': 'application/cbor' };
      if (provider === 'blockfrost' && blockfrostKey) headers.project_id = blockfrostKey;

      const resp = await fetch(url, { method: 'POST', headers, body: cborBytes });
      const text = await resp.text();

      if (!resp.ok) return NextResponse.json({ error: text }, { status: resp.status });

      // Koios returns tx hash as plain text, Blockfrost returns JSON
      try { return NextResponse.json(JSON.parse(text)); } catch { return NextResponse.json(text); }
    }

    // JSON request (all other endpoints)
    const headers = { 'Accept': 'application/json', 'Content-Type': 'application/json' };
    if (provider === 'blockfrost' && blockfrostKey) headers.project_id = blockfrostKey;

    const fetchOpts = { method, headers };
    if (body && method !== 'GET') fetchOpts.body = JSON.stringify(body);

    const resp = await fetch(url, fetchOpts);
    const data = await resp.json().catch(() => null);

    return NextResponse.json(data || [], { status: resp.status });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
