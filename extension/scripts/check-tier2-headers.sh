#!/bin/bash
# Tier-2 header check.
#
# Every "tier-2 adapted" file in the extension must begin with a header
# comment naming its wallet source and the runtime adaptation it carries.
# Per conventions §2 Tier-2:
#
#   /**
#    * Tier-2 adapted from wallet/src/<original-path>
#    * Differences: <one-line summary>
#    */
#
# The list below is the AUDITED set of tier-2 files. Files not in this list
# are extension-original (no wallet derivation) or imported via @/ (Tier-1)
# and exempt from this check.
#
# Add entries as new tier-2 adaptations land (per E0XX task).
#
# Usage:
#   bash scripts/check-tier2-headers.sh

set -euo pipefail

EXT_ROOT="src"
TIER2_FILES=(
  "shared/storage-adapter.js"
)

# Future tier-2 files (uncomment as the E0XX tasks land):
#   "contexts/BeamOperationsContext.jsx"        # E017

missing_file="$(mktemp)"
trap 'rm -f "$missing_file"' EXIT

for rel in "${TIER2_FILES[@]}"; do
  full="$EXT_ROOT/$rel"
  if [ ! -f "$full" ]; then
    # Not yet ported by its task — skip.
    continue
  fi
  if ! head -5 "$full" | grep -q "Tier-2 adapted from wallet/src"; then
    echo "❌ Missing tier-2 header: $rel"
    echo "$rel" >> "$missing_file"
  fi
done

if [ -s "$missing_file" ]; then
  count="$(wc -l < "$missing_file")"
  echo ""
  echo "$count tier-2 file(s) missing the derivation header."
  exit 1
fi
echo "✓ Tier-2 headers OK ($(( ${#TIER2_FILES[@]} )) file(s) checked)."
