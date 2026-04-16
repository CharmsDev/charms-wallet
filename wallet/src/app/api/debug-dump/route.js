import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST() {
  // Debug dump is local-dev only (uses fs which doesn't exist on edge/Cloudflare).
  // In production, return silently — the caller already has .catch(() => {}).
  return NextResponse.json({ ok: false, error: 'debug-dump not available in production' }, { status: 204 });
}
