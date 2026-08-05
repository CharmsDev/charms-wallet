#!/bin/bash
# release.sh
#
# Repeatable release pipeline for the Charms Wallet extension.
# Runs at every milestone (α₂, β₁, β₂, β₃, RC, GA per the roadmap).
#
# Pipeline:
#   1. Clean working tree + on main
#   2. Pre-flight: full E020 verifier suite (paths, tier-2, manifest,
#      version, wasm)
#   3. Bump version (patch | minor | major | explicit) via bump-version.js
#   4. Re-run check:version (sanity)
#   5. npm ci (wallet first — extension imports via @/) + npm ci (extension)
#   6. npm run build:prod
#   7. verify-dist.js (all artefacts + wasms in dist/)
#   8. Re-verify manifest in dist/ (production policy)
#   9. Zip dist/ → zip/charms-wallet-extension-<version>.zip
#  10. verify-zip.js (extract + re-verify)
#  11. Stage + commit version bumps
#  12. Tag extension-v<version>  (NOT pushed — operator does that)
#
# Defensive — refuses to run on a dirty tree or off main.
#
# Usage:
#   bash scripts/release.sh patch       # x.y.Z+1
#   bash scripts/release.sh minor       # x.Y+1.0
#   bash scripts/release.sh major       # X+1.0.0
#   bash scripts/release.sh 1.2.3       # explicit
#   bash scripts/release.sh --dry-run patch    # everything except commit + tag

set -euo pipefail

DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then DRY_RUN=1; shift; fi
BUMP="${1:-}"
[ -z "$BUMP" ] && { echo "Usage: $0 [--dry-run] <patch|minor|major|x.y.z>"; exit 1; }

EXT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WALLET_DIR="$(cd "$EXT_DIR/../wallet" && pwd)"
cd "$EXT_DIR"

# ─── 1. Clean working tree + on main ────────────────────────────────────
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Working tree not clean. Commit or stash, then retry."
  exit 1
fi
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "main" ]; then
  echo "❌ Releases must come from main. Current branch: $BRANCH"
  exit 1
fi
echo "✓ Clean tree on main"

# ─── 2. Pre-flight verifier suite (E020) ────────────────────────────────
echo ""
echo "── Pre-flight checks ───────────────────────────────────────────────"
npm run check:wallet-paths   --silent
npm run check:tier2          --silent
npm run check:manifest       --silent
npm run check:version        --silent
npm run check:wasm           --silent

# ─── 3. Bump version ────────────────────────────────────────────────────
echo ""
echo "── Bump version ────────────────────────────────────────────────────"
node scripts/bump-version.js "$BUMP"
npm run check:version --silent

NEW_VERSION="$(node -p "require('./package.json').version")"
ZIP_NAME="charms-wallet-extension-${NEW_VERSION}.zip"
ZIP_PATH="${EXT_DIR}/zip/${ZIP_NAME}"

# ─── 4. Install deps ────────────────────────────────────────────────────
echo ""
echo "── Install deps ────────────────────────────────────────────────────"
( cd "$WALLET_DIR" && npm ci --no-audit --no-fund )
npm ci --no-audit --no-fund

# ─── 5. Production build ────────────────────────────────────────────────
echo ""
echo "── Production build ────────────────────────────────────────────────"
npm run build:prod
# vite.config copyStaticFiles(false) already drops the prod manifest into
# dist/manifest.json. Double-check.
[ -f dist/manifest.json ] || { echo "❌ dist/manifest.json missing post-build"; exit 1; }

# ─── 6. Dist + manifest re-verification ─────────────────────────────────
echo ""
echo "── Post-build verification ─────────────────────────────────────────"
node scripts/verify-dist.js dist
node scripts/verify-prod-manifest.js dist/manifest.json

# ─── 7. Zip ─────────────────────────────────────────────────────────────
echo ""
echo "── Packaging ───────────────────────────────────────────────────────"
mkdir -p zip
rm -f "$ZIP_PATH"
( cd dist && zip -qr "$ZIP_PATH" . )
node scripts/verify-zip.js "$ZIP_PATH"

if [ "$DRY_RUN" = "1" ]; then
  echo ""
  echo "── Dry run — reverting version bump ─────────────────────────────"
  git checkout -- package.json manifest.json manifest.dev.json
  rm -f "$ZIP_PATH"
  echo "✅ Dry run complete; no commit, no tag, no zip kept."
  exit 0
fi

# ─── 8. Commit + tag ────────────────────────────────────────────────────
echo ""
echo "── Commit + tag ────────────────────────────────────────────────────"
git add package.json manifest.json manifest.dev.json
git commit -m "release(extension): v${NEW_VERSION}"
git tag -a "extension-v${NEW_VERSION}" -m "Extension release v${NEW_VERSION}"

echo ""
echo "✅ Released extension v${NEW_VERSION}"
echo "   ZIP:  $ZIP_PATH"
echo "   Tag:  extension-v${NEW_VERSION} (NOT pushed — push manually when ready)"
echo ""
echo "Next:"
echo "  - Manual smoke install on Chrome / Brave / Edge"
echo "  - git push origin main"
echo "  - git push origin extension-v${NEW_VERSION}"
echo "  - Upload ZIP to Chrome Web Store dashboard"
