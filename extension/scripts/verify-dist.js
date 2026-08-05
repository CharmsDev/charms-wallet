#!/usr/bin/env node
/**
 * verify-dist.js
 *
 * After `npm run build:prod`, verify dist/ contains all expected
 * artefacts before we zip and tag. Reads expected paths from
 * `release-config.json`. Fails the release if anything is missing.
 *
 * Usage:
 *   node scripts/verify-dist.js [dist-path]   # default: ./dist
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve as resolvePath, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}
function ok(msg) {
  console.log(`✓ ${msg}`);
}

const distDir = resolvePath(process.cwd(), process.argv[2] || 'dist');
if (!existsSync(distDir)) fail(`dist not found: ${distDir}`);

const cfgPath = resolvePath(__dirname, 'release-config.json');
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));

let missing = 0;

// Core artefacts
for (const rel of cfg.expected_dist_files || []) {
  const full = join(distDir, rel);
  if (!existsSync(full)) {
    console.error(`❌ missing: ${rel}`);
    missing++;
  }
}
if (missing === 0) ok(`${(cfg.expected_dist_files || []).length} core files present`);

// WASM artefacts under dist/<wasm_dist_path>
const wasmDir = join(distDir, (cfg.wasm_dist_path || 'wasm/').replace(/\/+$/, ''));
for (const wasm of cfg.expected_wasm_files || []) {
  const full = join(wasmDir, wasm);
  if (!existsSync(full)) {
    console.error(`❌ missing wasm: ${(cfg.wasm_dist_path || 'wasm/') + wasm}`);
    missing++;
  } else {
    const size = statSync(full).size;
    console.log(`✓ ${(cfg.wasm_dist_path || 'wasm/') + wasm} (${(size/1024).toFixed(1)} KB)`);
  }
}

if (missing > 0) {
  console.error(`\n${missing} required artefact(s) missing. Did npm run build:prod complete cleanly?`);
  process.exit(1);
}

// Light bundle size sanity (popup initial). Bundled output is in
// dist/assets/popup.js after vite, but the build may also produce
// chunked files. Print sizes as informational; don't fail.
const assetsDir = join(distDir, 'assets');
if (existsSync(assetsDir)) {
  const { readdirSync } = await import('node:fs');
  const files = readdirSync(assetsDir);
  console.log('\n📊 dist/assets/ sizes:');
  for (const f of files.sort()) {
    const size = statSync(join(assetsDir, f)).size;
    console.log(`   ${(size/1024).toFixed(1).padStart(8)} KB  ${f}`);
  }
}

console.log('\n✅ dist/ verified.');
