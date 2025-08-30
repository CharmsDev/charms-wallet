import { NextResponse } from 'next/server';

export const runtime = 'edge';

// CORS: restrict to known frontends
const allowedOrigins = new Set([
  'http://localhost:3456',
  'http://localhost:5179',
  'https://bro.charms.dev',
  'https://wallet.charms.dev',
]);

function buildCorsHeaders(origin) {
  const headers = new Headers();
  if (origin && allowedOrigins.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
    headers.set('Access-Control-Max-Age', '600');
  }
  return headers;
}

export async function OPTIONS(request) {
  const origin = request.headers.get('origin') || '';
  const corsHeaders = buildCorsHeaders(origin);
  return new Response(null, { status: 204, headers: corsHeaders });
}

// Helpers
function normalizeNetwork(input) {
  const norm = (input || '').toString().toLowerCase().replace(/\s+/g, '');
  // Accept both 'testnet' and 'testnet4' as 'testnet'
  if (norm === 'testnet4') return 'testnet';
  return norm;
}

function resolveQuickNodeConfig(targetNetwork) {
  const mainnetUrl = process.env.NEXT_PUBLIC_QUICKNODE_BITCOIN_MAINNET_URL;
  const testnetUrl = process.env.NEXT_PUBLIC_QUICKNODE_BITCOIN_TESTNET_URL;
  const mainnetApiKey = process.env.NEXT_PUBLIC_QUICKNODE_BITCOIN_MAINNET_API_KEY;
  const testnetApiKey = process.env.NEXT_PUBLIC_QUICKNODE_API_KEY; // kept for backward compatibility

  const url = targetNetwork === 'mainnet' ? mainnetUrl : targetNetwork === 'testnet' ? testnetUrl : null;
  const apiKey = targetNetwork === 'mainnet' ? mainnetApiKey : targetNetwork === 'testnet' ? testnetApiKey : null;

  return { url, apiKey };
}

function buildBasicAuthHeader(apiKey) {
  if (!apiKey) return undefined;
  // Edge-friendly Basic Auth (no Buffer)
  const token = typeof btoa === 'function' ? btoa(`${apiKey}:`) : Buffer.from(`${apiKey}:`).toString('base64');
  return `Basic ${token}`;
}

// Server-side proxy to QuickNode to bypass browser CORS restrictions.
// Accepts JSON body: { method: string, params?: any[], network?: 'mainnet'|'testnet' }
export async function POST(request) {
  try {
    const origin = request.headers.get('origin') || '';
    const corsHeaders = buildCorsHeaders(origin);
    const body = await request.json();
    const { method, params = [], network } = body || {};

    if (!method || typeof method !== 'string') {
      return new NextResponse(JSON.stringify({ error: 'Invalid request: missing method' }), { status: 400, headers: corsHeaders });
    }

    // Determine target network and credentials
    const rawNetwork = network || process.env.NEXT_PUBLIC_BITCOIN_NETWORK || '';
    const targetNetwork = normalizeNetwork(rawNetwork);
    const { url, apiKey } = resolveQuickNodeConfig(targetNetwork);

    if (!url || url.trim() === '') {
      console.error(`[QUICKNODE-API] No URL configured for network: ${targetNetwork}`);
      return new NextResponse(JSON.stringify({ error: `QuickNode not configured for network: ${targetNetwork}` }), { status: 400, headers: corsHeaders });
    }

    if (!apiKey || apiKey.trim() === '') {
      console.error(`[QUICKNODE-API] No API key configured for network: ${targetNetwork}`);
      return new NextResponse(JSON.stringify({ error: `QuickNode API key not configured for network: ${targetNetwork}` }), { status: 400, headers: corsHeaders });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const rpcPayload = {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    };
    
    // Prepare headers with authentication (HTTP Basic: apiKey as username, empty password)
    const headers = { 'Content-Type': 'application/json' };
    const authHeader = buildBasicAuthHeader(apiKey);
    if (authHeader) headers['Authorization'] = authHeader;
    
    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(rpcPayload),
      signal: controller.signal,
      // Server-to-server call; no need for CORS settings
    });

    clearTimeout(timeout);

    // Try to pass through QuickNode JSON-RPC response as-is
    const data = await upstream.json().catch(() => null);

    if (!upstream.ok) {
      console.error(`[QUICKNODE-API] Upstream error ${upstream.status}`, data);
      return new NextResponse(JSON.stringify({ error: `QuickNode API error: ${upstream.status}`, data }), { status: upstream.status, headers: corsHeaders });
    }

    // Successful JSON response with CORS headers
    const success = data ?? { error: 'Empty response from QuickNode' };
    const resp = new NextResponse(JSON.stringify(success), { status: 200 });
    // Merge CORS headers onto response
    corsHeaders.forEach((value, key) => resp.headers.set(key, value));
    resp.headers.set('Content-Type', 'application/json');
    return resp;
  } catch (err) {
    const message = err?.name === 'AbortError' ? 'QuickNode request timed out' : (err?.message || 'Unknown server error');
    console.error(`[QUICKNODE-API] Proxy error`, err);
    // Best-effort CORS on error
    const headers = buildCorsHeaders('');
    return new NextResponse(JSON.stringify({ error: message }), { status: 502, headers });
  }
}

