/**
 * Bitcoin finality monitor.
 * Polls for confirmations until the required threshold is met.
 */

import { getMempoolBase, EXPLORER_API, getExplorerNetworkParam } from '@/services/charm-transfer/constants';

// Need 7 confirmations: the Cardano prover requires 6 subsequent block headers
// after the tx's block (block+1 through block+6). 6 confirmations only
// guarantees block+5 exists; we need block+6 too.
const REQUIRED_CONFIRMATIONS = 7;
const POLL_INTERVAL_MS = 60_000; // 1 minute

/**
 * Wait for a Bitcoin transaction to reach N confirmations.
 *
 * @param {string} txid     - Bitcoin transaction ID
 * @param {string} network  - 'mainnet' | 'testnet4'
 * @param {function} onProgress - (confirmations: number, required: number) => void
 * @param {AbortSignal} [signal] - Optional abort signal
 * @returns {Promise<number>} - Final confirmation count
 */
export async function waitForBtcFinality(txid, network, onProgress, signal) {
  while (true) {
    if (signal?.aborted) throw new Error('Beam cancelled');

    const confirmations = await getConfirmations(txid, network);
    onProgress(confirmations, REQUIRED_CONFIRMATIONS);

    if (confirmations >= REQUIRED_CONFIRMATIONS) return confirmations;

    await sleep(POLL_INTERVAL_MS, signal);
  }
}

/**
 * Get current confirmation count for a Bitcoin tx.
 * Tries Explorer API first, falls back to mempool.space.
 */
async function getConfirmations(txid, network) {
  // Try Explorer API
  try {
    const netParam = getExplorerNetworkParam(network);
    const resp = await fetch(`${EXPLORER_API}/v1/wallet/tx/${txid}?network=${netParam}`);
    if (resp.ok) {
      const data = await resp.json();
      if (typeof data.confirmations === 'number') return data.confirmations;
    }
  } catch { /* fallback */ }

  // Fallback: mempool.space
  try {
    const base = getMempoolBase(network);
    const resp = await fetch(`${base}/tx/${txid}`);
    if (resp.ok) {
      const data = await resp.json();
      if (data.status?.confirmed && data.status?.block_height) {
        const tipResp = await fetch(`${base}/blocks/tip/height`);
        if (tipResp.ok) {
          const tipHeight = parseInt(await tipResp.text());
          return tipHeight - data.status.block_height + 1;
        }
      }
      return 0;
    }
  } catch { /* no confirmations yet */ }

  return 0;
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
