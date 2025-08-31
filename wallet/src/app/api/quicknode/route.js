import { NextResponse } from 'next/server';

export const runtime = 'edge';
// Proxy disabled: return 410 Gone for any request
export async function OPTIONS() {
  return new NextResponse(JSON.stringify({ error: 'QuickNode proxy disabled' }), { status: 410, headers: { 'Content-Type': 'application/json' } });
}

export async function POST() {
  return new NextResponse(JSON.stringify({ error: 'QuickNode proxy disabled' }), { status: 410, headers: { 'Content-Type': 'application/json' } });
}

