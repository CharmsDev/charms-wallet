/**
 * Dynamic Bitcoin fee rate — mirrors charms-cast exactly.
 *
 * Single source of truth across the wallet (regular send, charm transfer,
 * beam). Fetches mempool.space's `halfHourFee`, multiplies by 1.1 (10%
 * margin), ceils, and enforces a 2.5 sat/vB floor.
 *
 * Reference: charms-cast/webapp/src/services/providers/mempool.ts:121-126
 */

import { getMempoolBase } from '@/services/charm-transfer/constants';

const MIN_FEE_RATE = 2.5;
const MARGIN = 1.1;

// Fallback matches cast's defaults: halfHourFee=3 → ceil(3 * 1.1) = 4 sat/vB
const FALLBACK_HALF_HOUR_FEE = 3;

export async function getNetworkFeeRate(network = 'mainnet') {
  let halfHourFee = FALLBACK_HALF_HOUR_FEE;
  let source = 'defaults';
  try {
    const resp = await fetch(`${getMempoolBase(network)}/v1/fees/recommended`);
    if (resp.ok) {
      const data = await resp.json();
      halfHourFee = data.halfHourFee ?? FALLBACK_HALF_HOUR_FEE;
      source = 'mempool.space';
    }
  } catch {
    // swallow — defaults applied
  }
  const rate = Math.max(MIN_FEE_RATE, Math.ceil(halfHourFee * MARGIN));
  console.log(`[FeeRate] ${rate} sat/vB (halfHourFee=${halfHourFee}, source=${source}, network=${network})`);
  return rate;
}
