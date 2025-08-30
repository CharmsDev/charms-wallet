import { NextResponse } from 'next/server';

export const runtime = 'edge';

// Server-side proxy to QuickNode to bypass browser CORS restrictions.
// Accepts a JSON body: { method: string, params?: any[], network?: 'mainnet'|'testnet' }
export async function POST(request) {
  try {
    const body = await request.json();
    const { method, params = [], network } = body || {};

    console.log(`[QUICKNODE-API] Request: method=${method}, network=${network}, params=${JSON.stringify(params)}`);

    if (!method || typeof method !== 'string') {
      return NextResponse.json({ error: 'Invalid request: missing method' }, { status: 400 });
    }

    // Resolve QuickNode URL and API key based on network
    const mainnetUrl = process.env.NEXT_PUBLIC_QUICKNODE_BITCOIN_MAINNET_URL;
    const testnetUrl = process.env.NEXT_PUBLIC_QUICKNODE_BITCOIN_TESTNET_URL;
    const mainnetApiKey = process.env.NEXT_PUBLIC_QUICKNODE_BITCOIN_MAINNET_API_KEY;
    const testnetApiKey = process.env.NEXT_PUBLIC_QUICKNODE_API_KEY;
    
    console.log(`[QUICKNODE-API] Environment URLs - mainnet: ${mainnetUrl ? 'configured' : 'NOT SET'}, testnet: ${testnetUrl ? 'configured' : 'NOT SET'}`);

    const targetNetwork = network || process.env.NEXT_PUBLIC_BITCOIN_NETWORK;
    const url = targetNetwork === 'mainnet' ? mainnetUrl : targetNetwork === 'testnet' ? testnetUrl : null;
    const apiKey = targetNetwork === 'mainnet' ? mainnetApiKey : targetNetwork === 'testnet' ? testnetApiKey : null;

    console.log(`[QUICKNODE-API] Target network: ${targetNetwork}, Selected URL: ${url ? 'configured' : 'NOT CONFIGURED'}, API Key: ${apiKey ? 'configured' : 'NOT CONFIGURED'}`);

    if (!url || url.trim() === '') {
      console.error(`[QUICKNODE-API] ERROR: No URL configured for network ${targetNetwork}`);
      return NextResponse.json({ error: `QuickNode not configured for network: ${targetNetwork}` }, { status: 400 });
    }

    if (!apiKey || apiKey.trim() === '') {
      console.error(`[QUICKNODE-API] ERROR: No API key configured for network ${targetNetwork}`);
      return NextResponse.json({ error: `QuickNode API key not configured for network: ${targetNetwork}` }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const rpcPayload = {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    };

    console.log(`[QUICKNODE-API] Making request to: ${url.substring(0, 50)}...`);
    
    // Prepare headers with authentication
    const headers = {
      'Content-Type': 'application/json',
    };

    // QuickNode uses HTTP Basic Auth with API key as username and empty password
    if (apiKey) {
      const auth = Buffer.from(`${apiKey}:`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }
    
    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(rpcPayload),
      signal: controller.signal,
      // Server-to-server call; no need for CORS settings
    });

    clearTimeout(timeout);
    
    console.log(`[QUICKNODE-API] QuickNode response status: ${upstream.status}`);

    // Try to pass through QuickNode JSON-RPC response as-is
    const data = await upstream.json().catch(() => null);
    
    console.log(`[QUICKNODE-API] Response data:`, data ? 'received' : 'empty');

    if (!upstream.ok) {
      console.error(`[QUICKNODE-API] QuickNode API error: ${upstream.status}`, data);
      return NextResponse.json({ error: `QuickNode API error: ${upstream.status}`, data }, { status: upstream.status });
    }

    return NextResponse.json(data ?? { error: 'Empty response from QuickNode' }, { status: 200 });
  } catch (err) {
    const message = err?.name === 'AbortError' ? 'QuickNode request timed out' : (err?.message || 'Unknown server error');
    console.error(`[QUICKNODE-API] Error:`, err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
