/**
 * Step 2: Wait for Cardano placeholder tx confirmation.
 *
 * Input:  txHash
 * Output: { block, slot }
 */

import { getCardanoTx } from '@/services/cardano/api';

const POLL_INTERVAL_MS = 10_000;
const TIMEOUT_MS = 5 * 60_000;

export async function waitForCardanoConfirm({ txHash, onStatus, signal }) {
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error('Beam cancelled');

    const tx = await getCardanoTx(txHash);
    if (tx && (tx.block || tx.block_height)) {
      onStatus?.(`Cardano tx confirmed in block ${tx.block || tx.block_height}`);
      return { block: tx.block || tx.block_height, slot: tx.slot || tx.abs_slot };
    }

    onStatus?.('Waiting for Cardano confirmation...');
    await sleep(POLL_INTERVAL_MS, signal);
  }

  throw new Error(`Cardano tx ${txHash} not confirmed within ${TIMEOUT_MS / 60_000} minutes`);
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Beam cancelled')); }, { once: true });
  });
}
