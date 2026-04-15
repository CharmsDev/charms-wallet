import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DUMP_DIR = '/Users/ricartjuncadella/Documents/Prj/bitcoinos/_rjj/tmp';

export async function POST(req) {
  try {
    const { filename, data } = await req.json();
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = path.join(DUMP_DIR, safeName);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return NextResponse.json({ ok: true, path: filePath });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
