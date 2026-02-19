# Failover Services

**This folder contains failover sync logic used ONLY when the Charms Explorer API is unavailable.**

## When does failover activate?

The primary sync flow in `extension-wallet-sync.js` uses the Explorer indexed API:

- `GET /v1/wallet/balance/{address}` → instant BTC balance
- `GET /v1/wallet/charms/{address}` → instant charm/token balances

If the Explorer API is down or unreachable (circuit breaker tripped, network error, etc.),
the sync automatically falls back to these modules.

## What's in here?

| File                    | Purpose                                                    | Dependencies                       |
| ----------------------- | ---------------------------------------------------------- | ---------------------------------- |
| `wallet-sync.js`        | Full sync via UTXO scan + prover verify                    | utxo-sync, charm-sync              |
| `charm-sync.js`         | Charm extraction via prover `/spells/verify`               | charm-verifier                     |
| `charm-verifier.js`     | Fetches tx hex from mempool.space, verifies via prover API | mempool.space, mock-prover.fly.dev |
| `charm-tx-extractor.js` | Enriches tx history with charm data via prover             | mempool.space, mock-prover.fly.dev |

## Legacy flow (slow, ~10-30s)

```
For each address:
  1. GET /v1/wallet/utxos/{address}     → list UTXOs
  2. For each unique txid:
     a. GET mempool.space/tx/{txid}/hex → raw tx hex
     b. POST mock-prover/spells/verify  → extract charms from tx
  3. Sum UTXO values                    → BTC balance
```

## Can I delete this folder?

Yes — if the Explorer API is stable and you no longer need failover.
Remove this folder and the `failoverSync` import in `extension-wallet-sync.js`.
The wallet will then rely exclusively on the Explorer API.
