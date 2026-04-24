/**
 * Bitcoin fee rate fetcher — delegates to the shared helper so every wallet
 * path (send, charm transfer, beam) uses the same criterion as charms-cast.
 */

import { getNetworkFeeRate } from '@/services/shared/fee-rate';

export async function fetchFeeRate(network) {
  return getNetworkFeeRate(network);
}
