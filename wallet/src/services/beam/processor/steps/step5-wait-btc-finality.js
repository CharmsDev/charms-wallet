/**
 * Step 5: Wait for Bitcoin finality (6 confirmations).
 *
 * Input:  btcTxid, network
 * Output: { confirmations }
 */

import { waitForBtcFinality } from '../../chains/bitcoin/finality';

export async function waitForBtcFinal({ btcTxid, network, onStatus, signal }) {
  onStatus?.('Waiting for Bitcoin finality (0/6 confirmations)...');

  const confirmations = await waitForBtcFinality(
    btcTxid, network,
    (confs, required) => onStatus?.(`Waiting for Bitcoin finality (${confs}/${required} confirmations)...`),
    signal,
  );

  return { confirmations };
}
