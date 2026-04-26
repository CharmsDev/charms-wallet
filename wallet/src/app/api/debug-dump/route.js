import { NextResponse } from 'next/server';

// Node runtime so `fs` is available in local dev. In prod (Cloudflare) the
// route is a no-op fs-wise; just logs to the worker console.
export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const { filename, data } = await req.json();
    console.log(`[debug-dump] ${filename} (${JSON.stringify(data).length} bytes)`);

    if (process.env.NODE_ENV === 'development') {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const DUMP_DIR = '/Users/ricartjuncadella/Documents/Prj/bitcoinos/_rjj/tmp';
        const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        fs.writeFileSync(path.join(DUMP_DIR, safeName), JSON.stringify(data, null, 2));
      } catch (e) { console.warn('[debug-dump] write failed:', e?.message); }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
