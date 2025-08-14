# Bitcoin Wallet Signing & Broadcasting Refactor Plan (Updated)

## 1) Current Architecture (validated)
- __Standard transfers__: `@scure/btc-signer` in `wallet/src/services/wallet/bitcoin-scure-signer.js`.
- __Charms feature (commit/spell)__: `bitcoinjs-lib` in `wallet/src/services/charms/sign/` (`signCommitTx.js`, `signSpellTx.js`).
- __Broadcasting__: generic `wallet/src/services/wallet/broadcast-service.js` for single tx; specialized `wallet/src/services/charms/sign/broadcastTx.js` for two-tx package to proprietary backend.
- __Legacy duplication__: `wallet/src/services/wallet/core/` (sign.js/transaction.js/wallet.js) duplicates functionality and causes confusion.

## 2) Changes Implemented
- __Orchestrator migrated to @scure__: `transaction-orchestrator.js` now uses `bitcoin-scure-signer.createAndSignTransaction()` (replaces `./core/sign`).
- __Pre-signing UTXO verification added__: `TransactionOrchestrator.verifyAndFilterUtxos()` refreshes UTXOs via `utxoService.fetchAndStoreAllUTXOs()` and filters:
  - Removes blacklisted UTXOs (incl. `0847f5b6...2957:1`).
  - Keeps only UTXOs found in the latest fetched set to avoid "bad-txns-inputs-missingorspent".
- __Broadcast unchanged for standard tx__: still via `broadcast-service.js` to mempool.space API.

Files:
- `wallet/src/services/wallet/transaction-orchestrator.js` updated.

## 3) Next Actions
- __Remove legacy core directory__ (no remaining imports):
  - Delete `wallet/src/services/wallet/core/` (`sign.js`, `transaction.js`, `wallet.js`).
- __Rename specialized Charms broadcaster__:
  - `wallet/src/services/charms/sign/broadcastTx.js` → `submit-charm-txs.js`.
  - Update import in `wallet/src/components/wallet/charms/transfer-steps/BroadcastStep.js`.
- __Code cleanup__ (professionalization):
  - Reduce noisy logs in `bitcoin-scure-signer.js` and `broadcast-service.js`.
  - Keep essential error messages and brief progress logs only.
  - Ensure functions remain small and focused; remove duplication.

## 4) Rationale
- __Single source of truth for standard signing__: `@scure` PSBT flow is modern, robust, and simpler to maintain.
- __Feature isolation__: Charms uses `bitcoinjs-lib` in its own directory, not under wallet "core".
- __Reliability__: UTXO verification immediately before signing prevents stale inputs from causing broadcast failures.

## 5) Test Plan
- __Unit-ish integration checks__
  - Build/send a small standard transfer using a known-good UTXO.
  - Confirm `TransactionOrchestrator.processTransaction()` yields signed hex and broadcast returns a txid.
  - Verify blacklisted UTXO `...2957:1` is excluded even if present in storage.
- __Charms flows__
  - Ensure Charms commit+spell signing still works (untouched) and broadcasting via the renamed function still submits the package.

## 6) Rollback
- Revert orchestrator to prior import if needed and restore `core/` directory from VCS.

---
Status: orchestrator migrated to @scure, pre-sign UTXO verification added. Proceed with core/ removal, file rename, and cleanup.
