#!/usr/bin/env node
/**
 * check-wasm-sha.js
 *
 * Drift detector: the extension copies WASM from wallet/public/wasm/
 * into dist/wasm/ at build time (vite copyStaticFiles per E014). This
 * verifier asserts the source files in wallet/public/wasm/ exist and
 * have non-zero size for every expected file in release-config.json.
 *
 * Run before tagging a release so a missing or corrupted wallet WASM
 * doesn't ship.
 *
 * Usage:
 *   node scripts/check-wasm-sha.js
 */

import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { dirname, resolve as resolvePath, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

function sha256(path) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(path)
      .on('data', (d) => h.update(d))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject);
  });
}

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

const cfgPath = resolvePath(__dirname, 'release-config.json');
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));

// Resolve wallet wasm source — relative to scripts/ -> ../../wallet/public/wasm
const walletWasmDir = resolvePath(__dirname, '..', cfg.wasm_source || '../wallet/public/wasm');
if (!existsSync(walletWasmDir)) fail(`Wallet wasm source not found: ${walletWasmDir}`);

const expected = cfg.expected_wasm_files || [];
let bad = 0;
console.log(`Checking ${expected.length} WASM files in ${walletWasmDir}`);

for (const name of expected) {
  const full = join(walletWasmDir, name);
  if (!existsSync(full)) {
    console.error(`❌ missing source wasm: ${name}`);
    bad++;
    continue;
  }
  const size = statSync(full).size;
  if (size === 0) {
    console.error(`❌ zero-byte source wasm: ${name}`);
    bad++;
    continue;
  }
  const hash = await sha256(full);
  console.log(`✓ ${name.padEnd(20)} ${(size/1024).toFixed(1).padStart(8)} KB  sha256=${hash.slice(0, 12)}…`);
}

if (bad > 0) fail(`${bad} wasm file(s) failed validation.`);
console.log('\n✅ All wallet wasm sources OK.');
