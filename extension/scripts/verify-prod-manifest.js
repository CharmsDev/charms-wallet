#!/usr/bin/env node
/**
 * verify-prod-manifest.js
 *
 * Pre-release sanity check on the production manifest.json. Catches:
 *   - Manifest V2 leftovers (must be V3)
 *   - Localhost / 127.0.0.1 host_permissions that should only live in
 *     manifest.dev.json
 *   - Missing required permissions (storage, alarms, offscreen)
 *   - Missing required hosts (koios, blockfrost, charms-explorer-api,
 *     mempool.space, prover.charms.dev, scrolls-v14.charms.dev)
 *   - Non-semver version
 *
 * Reads acceptable values from `release-config.json` so the policy can
 * evolve in one place.
 *
 * Usage:
 *   node scripts/verify-prod-manifest.js manifest.json
 *   node scripts/verify-prod-manifest.js dist/manifest.json
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}
function ok(msg) {
  console.log(`✓ ${msg}`);
}

const target = process.argv[2];
if (!target) fail('Usage: verify-prod-manifest.js <path-to-manifest.json>');
if (!existsSync(target)) fail(`Manifest not found: ${target}`);

const cfgPath = resolvePath(__dirname, 'release-config.json');
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
const manifest = JSON.parse(readFileSync(target, 'utf8'));

// MV3
if (manifest.manifest_version !== 3) fail(`Expected manifest_version=3, got ${manifest.manifest_version}`);
ok('manifest_version=3');

// Semver
if (!/^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/.test(manifest.version || '')) {
  fail(`Version not semver: "${manifest.version}"`);
}
ok(`version=${manifest.version}`);

// No localhost in production
const hosts = manifest.host_permissions || [];
const localhostLeaks = hosts.filter(h => /localhost|127\.0\.0\.1/.test(h));
if (localhostLeaks.length) {
  fail(`Localhost/loopback hosts in prod manifest: ${localhostLeaks.join(', ')}\n   ` +
       `Those belong in manifest.dev.json only.`);
}
ok('no localhost in host_permissions');

// Required permissions
const perms = manifest.permissions || [];
const missingPerms = (cfg.required_permissions || []).filter(p => !perms.includes(p));
if (missingPerms.length) {
  fail(`Missing required permissions: ${missingPerms.join(', ')}`);
}
ok(`permissions include all required: ${(cfg.required_permissions || []).join(', ')}`);

// Required hosts (substring match — patterns like '*.koios.rest' OK)
const missingHosts = (cfg.required_hosts || []).filter(h => !hosts.some(p => p.includes(h.replace('*.', ''))));
if (missingHosts.length) {
  fail(`Missing required hosts: ${missingHosts.join(', ')}`);
}
ok(`host_permissions include all required: ${(cfg.required_hosts || []).join(', ')}`);

// Service worker present
if (!manifest.background?.service_worker) {
  fail('Missing background.service_worker (MV3 requires it for the extension to do anything in the background).');
}
ok(`background.service_worker = ${manifest.background.service_worker}`);

console.log(`\n✅ Manifest valid for production (v${manifest.version}).`);
