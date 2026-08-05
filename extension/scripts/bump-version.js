#!/usr/bin/env node
/**
 * bump-version.js
 *
 * Bumps `package.json`, `manifest.json`, and `manifest.dev.json` to the
 * same next semver. Refuses to run if the three files are already out
 * of sync — that's a `check-version-sync.js` problem to fix first.
 *
 * Usage:
 *   node scripts/bump-version.js patch   # x.y.Z+1
 *   node scripts/bump-version.js minor   # x.Y+1.0
 *   node scripts/bump-version.js major   # X+1.0.0
 *   node scripts/bump-version.js 1.2.3   # explicit
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolvePath(__dirname, '..');

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function read(path) {
  if (!existsSync(path)) fail(`Missing: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function write(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

const arg = process.argv[2];
if (!arg) fail('Usage: bump-version.js <patch|minor|major|x.y.z>');

const pkgPath        = resolvePath(root, 'package.json');
const manifestPath   = resolvePath(root, 'manifest.json');
const manifestDevPath = resolvePath(root, 'manifest.dev.json');

const pkg      = read(pkgPath);
const manifest = read(manifestPath);
const manifestDev = existsSync(manifestDevPath) ? read(manifestDevPath) : null;

// Require pkg ↔ manifest to be in sync first (manifest.dev allowed to lag)
if (pkg.version !== manifest.version) {
  fail(`package.json (${pkg.version}) and manifest.json (${manifest.version}) drifted. ` +
       `Realign manually before bumping.`);
}

function next(current, bump) {
  if (/^\d+\.\d+\.\d+$/.test(bump)) return bump;
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!m) fail(`Current version not semver: ${current}`);
  const [, maj, min, pat] = m.map(Number);
  if (bump === 'patch') return `${maj}.${min}.${pat + 1}`;
  if (bump === 'minor') return `${maj}.${min + 1}.0`;
  if (bump === 'major') return `${maj + 1}.0.0`;
  fail(`Unknown bump: ${bump}`);
}

const target = next(pkg.version, arg);
console.log(`Bumping ${pkg.version} → ${target}`);

pkg.version = target;
manifest.version = target;
write(pkgPath, pkg);
write(manifestPath, manifest);

if (manifestDev) {
  manifestDev.version = target;
  write(manifestDevPath, manifestDev);
  console.log(`✓ Updated package.json, manifest.json, manifest.dev.json → ${target}`);
} else {
  console.log(`✓ Updated package.json, manifest.json → ${target}`);
}
