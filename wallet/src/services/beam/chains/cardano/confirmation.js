/**
 * Cardano transaction confirmation watcher.
 * Polls Blockfrost until a tx is confirmed in a block.
 */

import { getCardanoTx } from './api';

const POLL_INTERVAL_MS = 10_000; // 10 seconds (Cardano blocks ~20s)
const TIMEOUT_MS = 5 * 60_000;  // 5 minutes

/**
 * Wait for a Cardano transaction to be confirmed.
 *
 * @param {string} txHash
 * @param {function} [onStatus] - Status callback
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ block: string, slot: number }>}
 */
export async function waitForCardanoConfirmation(txHash, onStatus, signal) {
  const deadline = Date.now() + TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error('Beam cancelled');

    const tx = await getCardanoTx(txHash);
    if (tx && tx.block) {
      onStatus?.(`Cardano tx confirmed in block ${tx.block}`);
      return { block: tx.block, slot: tx.slot };
    }

    onStatus?.('Waiting for Cardano confirmation...');
    await sleep(POLL_INTERVAL_MS, signal);
  }

  throw new Error(`Cardano tx ${txHash} not confirmed within ${TIMEOUT_MS / 60_000} minutes`);
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('Beam cancelled'));
    }, { once: true });
  });
}
