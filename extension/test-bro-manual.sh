#!/bin/bash
# Manual test: Fetch UTXOs for the wallet address, call prover API, compute BRO total
# This simulates what the extension does, but from the command line.

WALLET_ADDR="tb1p9mpu9ez0kxfvs7yp884yfwcvz8xjw24gau7xakn6uzw5ek8rk8rskkqpz3"
MEMPOOL_API="https://mempool.space/testnet4/api"
PROVER_API="https://mock-prover.fly.dev/spells/verify"
BRO_APP_ID="t/3d7fe7e4cea6121947af73d70e5119bebd8aa5b7edfe74bfaf6e779a1847bd9b/c975d4e0c292fb95efbda5c13312d6ac1d8b5aeff7f0f1e5578645a2da70ff5f"

echo "=== Manual BRO Token Verification ==="
echo "Address: $WALLET_ADDR"
echo ""

# Step 1: Get all UTXOs
echo "--- Step 1: Fetching UTXOs ---"
UTXOS=$(curl -s "$MEMPOOL_API/address/$WALLET_ADDR/utxo")
echo "$UTXOS" | python3 -c "
import json, sys
utxos = json.load(sys.stdin)
print(f'Total UTXOs: {len(utxos)}')
txids = sorted(set(u['txid'] for u in utxos))
print(f'Unique txids: {len(txids)}')
for txid in txids:
    vouts = sorted([u for u in utxos if u['txid'] == txid], key=lambda x: x['vout'])
    print(f'  {txid}')
    for u in vouts:
        print(f'    vout={u[\"vout\"]} value={u[\"value\"]}')
total_sats = sum(u['value'] for u in utxos)
print(f'Total sats: {total_sats} ({total_sats/1e8:.8f} BTC)')
# Output txids for next step
for txid in txids:
    print(f'TXID:{txid}')
"

echo ""
echo "--- Step 2: Verify each tx via prover API ---"

# Get unique txids
TXIDS=$(echo "$UTXOS" | python3 -c "
import json, sys
utxos = json.load(sys.stdin)
for txid in sorted(set(u['txid'] for u in utxos)):
    print(txid)
")

for TXID in $TXIDS; do
    echo ""
    echo "Processing tx: $TXID"
    TX_HEX=$(curl -s "$MEMPOOL_API/tx/$TXID/hex")
    echo "  TX hex length: ${#TX_HEX}"
    
    RESULT=$(curl -s -X POST "$PROVER_API" \
        -H "Content-Type: application/json" \
        -d "{\"tx_hex\": \"$TX_HEX\", \"network\": \"testnet4\"}")
    
    echo "  Prover result:"
    echo "$RESULT" | python3 -c "
import json, sys
r = json.load(sys.stdin)
print(f'    success={r.get(\"success\")} verified={r.get(\"verified\")} charms_count={len(r.get(\"charms\", []))}')
if r.get('error'):
    print(f'    error: {r[\"error\"]}')
for c in r.get('charms', []):
    print(f'    charm: output_index={c.get(\"output_index\")} app_id={c.get(\"app_id\", \"?\")[:40]}... data={c.get(\"data\")}')
"
done

echo ""
echo "=== Done ==="
