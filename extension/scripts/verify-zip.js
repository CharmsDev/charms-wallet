#!/usr/bin/env node
/**
 * verify-zip.js
 *
 * Final smoke on the ZIP that release.sh just produced. Checks:
 *   - File exists, non-zero size
 *   - manifest.json inside zip parses + passes verify-prod-manifest
 *   - Required dist files inside zip (via unzip -l listing)
 *   - Total size within Chrome Web Store budget (10 MB, hard limit)
 *
 * Usage:
 *   node scripts/verify-zip.js zip/charms-wallet-extension-X.Y.Z.zip
 */

import { existsSync, statSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, resolve as resolvePath, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

const target = process.argv[2];
if (!target) fail('Usage: verify-zip.js <zip>');
if (!existsSync(target)) fail(`ZIP not found: ${target}`);

const size = statSync(target).size;
if (size === 0) fail('ZIP is empty');
if (size > 10 * 1024 * 1024) {
  fail(`ZIP > 10 MB (${(size/1024/1024).toFixed(2)} MB). Chrome Web Store rejects > 10 MB.`);
}
console.log(`✓ ZIP size: ${(size/1024/1024).toFixed(2)} MB`);

// Extract to a temp dir
const tmpDir = mkdtempSync(join(tmpdir(), 'charms-zip-verify-'));
try {
  execFileSync('unzip', ['-q', target, '-d', tmpDir]);

  // Check manifest
  const innerManifest = join(tmpDir, 'manifest.json');
  if (!existsSync(innerManifest)) fail('manifest.json missing inside zip');
  const manifest = JSON.parse(readFileSync(innerManifest, 'utf8'));
  console.log(`✓ manifest.json v${manifest.version} present`);

  // Run the manifest verifier on the extracted manifest
  execFileSync('node',
    [resolvePath(__dirname, 'verify-prod-manifest.js'), innerManifest],
    { stdio: 'inherit' });

  // Run dist verifier on the extracted folder
  execFileSync('node',
    [resolvePath(__dirname, 'verify-dist.js'), tmpDir],
    { stdio: 'inherit' });

  console.log(`\n✅ ZIP verified end-to-end: ${target}`);
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
