/**
 * Bitcoin fee rate fetcher.
 */

import { getMempoolBase, FALLBACK_FEE_RATE, MIN_FEE_RATE } from '@/services/charm-transfer/constants';

/**
 * Fetch current recommended fee rate.
 * @param {string} network - 'mainnet' | 'testnet4'
 * @returns {Promise<number>} Fee rate in sat/vB
 */
export async function fetchFeeRate(network) {
  try {
    const base = getMempoolBase(network);
    const resp = await fetch(`${base}/v1/fees/recommended`);
    if (resp.ok) {
      const fees = await resp.json();
      return Math.max(MIN_FEE_RATE, fees.economyFee || fees.hourFee || FALLBACK_FEE_RATE);
    }
  } catch { /* fallback */ }
  return FALLBACK_FEE_RATE;
}
