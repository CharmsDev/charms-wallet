import { NextResponse } from 'next/server';

export const runtime = 'edge';

// Server-side proxy to QuickNode to bypass browser CORS restrictions.
// Accepts a JSON body: { method: string, params?: any[], network?: 'mainnet'|'testnet' }
export async function POST(request) {
  try {
    const body = await request.json();
    const { method, params = [], network } = body || {};

    if (!method || typeof method !== 'string') {
      return NextResponse.json({ error: 'Invalid request: missing method' }, { status: 400 });
    }

    // Resolve QuickNode URL based on network (use same envs already configured for client)
    const mainnetUrl = process.env.NEXT_PUBLIC_QUICKNODE_BITCOIN_MAINNET_URL;
    const testnetUrl = process.env.NEXT_PUBLIC_QUICKNODE_BITCOIN_TESTNET_URL;

    const targetNetwork = network || process.env.NEXT_PUBLIC_BITCOIN_NETWORK;
    const url = targetNetwork === 'mainnet' ? mainnetUrl
      : targetNetwork === 'testnet' ? testnetUrl
      : null;

    if (!url || url.trim() === '') {
      return NextResponse.json({ error: `QuickNode not configured for network: ${targetNetwork}` }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const rpcPayload = {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    };

    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rpcPayload),
      signal: controller.signal,
      // Server-to-server call; no need for CORS settings
    });

    clearTimeout(timeout);

    // Try to pass through QuickNode JSON-RPC response as-is
    const data = await upstream.json().catch(() => null);

    if (!upstream.ok) {
      return NextResponse.json({ error: `QuickNode API error: ${upstream.status}`, data }, { status: upstream.status });
    }

    return NextResponse.json(data ?? { error: 'Empty response from QuickNode' }, { status: 200 });
  } catch (err) {
    const message = err?.name === 'AbortError' ? 'QuickNode request timed out' : (err?.message || 'Unknown server error');
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
