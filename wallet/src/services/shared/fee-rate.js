/**
 * Bitcoin fee rate — SINGLE SOURCE OF TRUTH.
 *
 * Every BTC tx the wallet builds (send, charm transfer, beam, eBTC,
 * placeholder, mint, redeem) MUST get its rate from this function.
 *
 * Formula:
 *   rate = max(MIN_FEE_RATE, mempool.space.fastestFee × MARGIN)
 *        = max(2.5, current_next-block_rate × 1.1), rounded to 1 decimal
 *
 * The floor (2.5 sat/vB) protects against a fee bump landing between
 * "selected funding" and "broadcast": a marginal 1–2 sat/vB tx can
 * sit for hours when the market shifts. The margin (×1.1) keeps us a
 * touch above the borderline so a small mempool surge doesn't strand us.
 * The result is a float — the prover and our selector both accept
 * fractional rates, so 2.4 stays 2.4 (we don't ceil to 3 and overpay).
 *
 * Anti-patterns (forbidden — any reintroduction is a regression):
 *   - shadow constants (FALLBACK_FEE_RATE, DEFAULT_FEE_RATE, MIN_FEE_RATE
 *     in other modules)
 *   - hardcoded `feeRate = N` defaults in function signatures
 *   - `feeRate || 5` fallback, `size * 5 : 1000` magic
 *   - any number ending in `sat/vB` literally typed outside this file
 */

import { getMempoolBase } from '@/services/charm-transfer/constants';

export const MIN_FEE_RATE = 2.5;       // floor — never broadcast below this
const MARGIN = 1.1;                    // 10% safety over current network rate
const FALLBACK_FASTEST_FEE = 5;        // mempool.space unreachable → 5 × 1.1 = 5.5 sat/vB

function round1(n) { return Math.round(n * 10) / 10; }

export async function getNetworkFeeRate(network = 'mainnet') {
  let fastestFee = FALLBACK_FASTEST_FEE;
  let source = 'defaults';
  try {
    const resp = await fetch(`${getMempoolBase(network)}/v1/fees/recommended`);
    if (resp.ok) {
      const data = await resp.json();
      fastestFee = data.fastestFee ?? FALLBACK_FASTEST_FEE;
      source = 'mempool.space';
    }
  } catch { /* swallow — fallback applied */ }
  const rate = Math.max(MIN_FEE_RATE, round1(fastestFee * MARGIN));
  console.log(`[FeeRate] ${rate} sat/vB (fastestFee=${fastestFee}, source=${source}, network=${network})`);
  return rate;
}
