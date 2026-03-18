import { NextResponse } from 'next/server';

export async function GET() {
    const pkg = require('../../../../package.json');
    return NextResponse.json({
        status: 'ok',
        version: pkg.version,
        timestamp: new Date().toISOString(),
    });
}
