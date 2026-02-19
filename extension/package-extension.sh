#!/bin/bash
# Build the extension and package it as a ZIP for download from the wallet web app.
# Usage: ./package-extension.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"
OUTPUT_DIR="$SCRIPT_DIR/../wallet/public/extension"
OUTPUT_FILE="$OUTPUT_DIR/charms-wallet-extension.zip"

echo "Building extension..."
cd "$SCRIPT_DIR"
npm run build

echo "Packaging extension ZIP..."
mkdir -p "$OUTPUT_DIR"
rm -f "$OUTPUT_FILE"
cd "$DIST_DIR"
zip -r "$OUTPUT_FILE" . -x ".*"

echo "Done: $OUTPUT_FILE"
echo "Size: $(du -h "$OUTPUT_FILE" | cut -f1)"
