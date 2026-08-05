#!/usr/bin/env node
/**
 * check-version-sync.js
 *
 * package.json `version` and manifest.json `version` MUST stay in sync.
 * release.sh (E022) writes both atomically via bump-version.js. This
 * verifier is the CI guard that catches manual drift before a tag goes
 * out.
 *
 * Usage:
 *   node scripts/check-version-sync.js
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolvePath(__dirname, '..');

const pkgPath = resolvePath(root, 'package.json');
const manifestPath = resolvePath(root, 'manifest.json');
const manifestDevPath = resolvePath(root, 'manifest.dev.json');

function read(path) {
  if (!existsSync(path)) throw new Error(`Missing: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

const pkg = read(pkgPath);
const manifest = read(manifestPath);

if (pkg.version !== manifest.version) {
  console.error(`❌ package.json (${pkg.version}) vs manifest.json (${manifest.version}) — version drift`);
  console.error('   Run `node scripts/bump-version.js <patch|minor|major>` to re-align (E022 ships this).');
  process.exit(1);
}
console.log(`✓ package.json + manifest.json aligned at ${pkg.version}`);

// manifest.dev.json may legitimately lag (it's a dev-time variant) but a
// warn-level signal helps catch large drifts.
if (existsSync(manifestDevPath)) {
  const dev = read(manifestDevPath);
  if (dev.version !== manifest.version) {
    console.warn(`⚠ manifest.dev.json (${dev.version}) lags manifest.json (${manifest.version}). Not a blocker.`);
  } else {
    console.log(`✓ manifest.dev.json aligned at ${dev.version}`);
  }
}

console.log('\n✅ Version-sync OK.');
