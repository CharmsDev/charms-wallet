/**
 * Dynamic Bitcoin fee rate — single source of truth for every BTC tx the
 * wallet builds (regular send, charm transfer, beam, eBTC mint+beam).
 *
 * Strategy:
 *   1. Pull mempool.space `fastestFee` (next-block target).
 *   2. Apply a 10% margin — pay a touch more than the borderline-included
 *      tx so a small bump in mempool pressure doesn't strand us.
 *   3. Floor at 2.5 sat/vB. The floor isn't about cost-saving, it's about
 *      protecting against the case where mempool reports a low fastestFee
 *      *just before* a wave of new txs raises the bar. Real-world: tx sits
 *      a few minutes, fee market shifts, and a marginal 1–2 sat/vB tx ends
 *      up stuck for hours. 2.5 is the lowest rate that has historically
 *      cleared on mainnet during routine load.
 *   4. Return as a float rounded to 1 decimal place. We don't ceil to
 *      integer because the prover/builder accept fractional rates and we
 *      don't want to overpay (e.g. 2.4 → 3 is +25%).
 *
 * Earlier we used `halfHourFee` (30 min target) which left a beam stuck
 * for two hours during a fee bump. `fastestFee` aims for the current
 * block; the margin + floor guard against the few-minute gap between
 * "selected funding" and "broadcast".
 */

import { getMempoolBase } from '@/services/charm-transfer/constants';

const MIN_FEE_RATE = 2.5;
const MARGIN = 1.1;

// Conservative fallback when mempool.space is unreachable. Picked to be
// safely confirmable on a normal day (5 sat/vB after the 1.1× margin).
const FALLBACK_FASTEST_FEE = 5;

/** Round a fee rate to 1 decimal place, preserving fractional rates so
 *  we don't pay 3 sat/vB when the network is asking for 2.4. */
function round1(n) {
  return Math.round(n * 10) / 10;
}

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
  } catch {
    // swallow — defaults applied
  }
  const rate = Math.max(MIN_FEE_RATE, round1(fastestFee * MARGIN));
  console.log(`[FeeRate] ${rate} sat/vB (fastestFee=${fastestFee}, source=${source}, network=${network})`);
  return rate;
}
