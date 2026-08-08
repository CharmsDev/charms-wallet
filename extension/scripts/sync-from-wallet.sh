#!/bin/bash
# verify-wallet-paths.sh (kept under sync-from-wallet.sh for historical name)
#
# The extension does NOT duplicate wallet code. It imports from wallet/src/
# via the Vite `@/` alias declared in vite.config.js:
#
#   resolve.alias['@'] = '../wallet/src'
#
# This script verifies the wallet source paths the extension expects to be
# importable still exist. Drift = missing or renamed file in wallet that
# the extension was relying on. We catch this in CI so an extension build
# never silently breaks because of a wallet refactor.
#
# Usage:
#   bash scripts/sync-from-wallet.sh             # check (default)
#   bash scripts/sync-from-wallet.sh --list      # print the path manifest

set -euo pipefail

# Anchor paths to the script's own location so the check works from any
# CWD (CI runs it via `working-directory: extension`; humans run it from
# repo root or anywhere else).
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WALLET_ROOT="$(cd "$SCRIPT_DIR/../../wallet/src" 2>/dev/null && pwd || echo "")"
if [ -z "$WALLET_ROOT" ]; then
  echo "❌ Could not resolve wallet/src/ from $SCRIPT_DIR. Expected ../../wallet/src relative to scripts/."
  exit 2
fi
MODE="${1:-check}"

# Paths the extension expects from the wallet @/ alias. Update when a new
# extension feature relies on a previously-unused wallet path.
EXPECTED_PATHS="
services/storage-keys.js
services/storage-version.js
services/storage-adapter.js
services/storage.ts
stores/blockchainStore.js
stores/walletStore.js
stores/walletInfoStore.js
stores/addressesStore.js
stores/utxoStore.js
stores/charmsStore.js
stores/transactionStore.js
stores/cardanoStore.js
contexts/BeamOperationsContext.js
contexts/NetworkContext.js
lib/bitcoin/txDecoder.js
lib/cardano/cardanoWasm.js
lib/cardano/wallet.ts
services/beam/index.js
services/beam/core/cbor.js
services/beam/core/crypto.js
services/beam/core/types.js
services/beam/core/persistence.js
services/beam/spells/builder.js
services/beam/spells/normalizer.js
services/beam/spells/beam-back-normalizer.js
services/beam/spells/payload.js
services/beam/processor/executor.js
services/beam/processor/executor-beam-back.js
services/beam/processor/executor-ebtc.js
services/beam/processor/executor-ebtc-redeem.js
services/beam/processor/resume.js
services/beam/chains/bitcoin/funding.js
services/beam/chains/bitcoin/finality.js
services/beam/chains/cardano/funding.js
services/beam/chains/cardano/api.js
services/cardano/api.js
services/cardano/send.js
services/cardano/send-cnt.js
services/cardano/tx-classifier.js
services/transactions/transaction-classifier.js
services/transactions/transaction-recorder.js
services/transactions/known-addresses.js
services/transactions/charm-transaction-extractor.js
services/utxo-reservations/index.js
services/utxo-reservations/reservation-store.js
services/wallet/sync/transactions-sync.js
services/wallet/rehydrate.js
services/shared/fee-rate.js
services/shared/explorer-wallet-service.js
services/shared/bitcoin-api-router.js
services/shared/mempool-service.js
services/charm-transfer/index.js
services/charm-transfer/constants.js
services/charm-transfer/executor.js
services/charm-transfer/broadcaster.js
services/charm-transfer/tx-fetcher.js
services/charm-transfer/tx-signer.js
services/wallet/sync/explorer-wallet-sync.js
services/wallet/post-broadcast.js
services/balance/index.js
services/balance/balance-service.js
services/balance/asset-key.js
services/balance/pending-repo.js
services/balance/use-balance.js
utils/media.js
services/auth/index.js
services/auth/blob.js
services/auth/prf-derive.js
services/auth/wallet-password.js
contexts/AuthContext.js
components/system/UnlockGate.jsx
components/system/MigrationGate.jsx
components/wallet/setup/WalletSetupWizard.jsx
components/wallet/setup/WalletInitialization.jsx
components/wallet/setup/AuthMethodSettings.jsx
"

if [ "$MODE" = "--list" ]; then
  echo "$EXPECTED_PATHS" | grep -v '^$' | sort
  exit 0
fi

missing_file="$(mktemp)"
trap 'rm -f "$missing_file"' EXIT

echo "$EXPECTED_PATHS" | while read -r rel; do
  [ -z "$rel" ] && continue
  full="$WALLET_ROOT/$rel"
  if [ ! -f "$full" ]; then
    echo "❌ MISSING in wallet: $rel"
    echo "$rel" >> "$missing_file"
  fi
done

if [ -s "$missing_file" ]; then
  count="$(wc -l < "$missing_file")"
  echo ""
  echo "$count wallet path(s) missing. Either:"
  echo "  - The wallet renamed/removed something the extension imports (fix wallet)"
  echo "  - The extension now needs a path not yet in wallet (update wallet via W### task)"
  exit 1
fi
echo "✓ All $(echo "$EXPECTED_PATHS" | grep -cv '^$') wallet paths present."
