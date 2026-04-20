import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req) {
  // In edge/Cloudflare: no fs available. Just log to console instead.
  try {
    const { filename, data } = await req.json();
    // Log payload summary to server console (visible in dev terminal)
    console.log(`[debug-dump] ${filename} (${JSON.stringify(data).length} bytes)`);

    // In local dev, try to write to disk via dynamic import
    if (process.env.NODE_ENV === 'development') {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const DUMP_DIR = '/Users/ricartjuncadella/Documents/Prj/bitcoinos/_rjj/tmp';
        const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        fs.writeFileSync(path.join(DUMP_DIR, safeName), JSON.stringify(data, null, 2));
      } catch {}
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
