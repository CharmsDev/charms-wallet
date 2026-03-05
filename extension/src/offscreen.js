/**
 * Offscreen Document — ZK Proof Runner
 *
 * Runs in a persistent hidden page (Chrome MV3 Offscreen Document API).
 * Executes long-running prover HTTP calls without the lifetime restrictions
 * of the service worker (~30s timeout).
 *
 * Lifecycle:
 *   1. background.js creates this document via chrome.offscreen.createDocument()
 *   2. Receives { type: 'RUN_PROVER', params } from background
 *   3. Runs proveCharmTransfer (5–10 min fetch to external prover server)
 *   4. Sends PROVER_STATUS updates while working
 *   5. Sends PROVER_RESULT on success or PROVER_ERROR on failure
 *   6. background.js closes this document after receiving the result
 */

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'RUN_PROVER') return;
  // Fire-and-forget: results are sent back via separate sendMessage calls
  runProver(message.params);
});

async function runProver(params) {
  const sendStatus = (msg) => {
    chrome.runtime.sendMessage({ type: 'PROVER_STATUS', message: msg }).catch(() => {});
  };

  try {
    const { proveCharmTransfer } = await import('./services/charm-transfer/executor.js');

    const result = await proveCharmTransfer({
      ...params,
      onStatus: sendStatus,
    });

    // Serialize Map → array (chrome.storage / postMessage can't carry Map objects)
    chrome.runtime.sendMessage({
      type: 'PROVER_RESULT',
      spellTxHex:       result.spellTxHex,
      prevTxMapEntries: [...result.prevTxMap.entries()],
      fee:              result.fee,
    }).catch(() => {});

  } catch (err) {
    chrome.runtime.sendMessage({
      type: 'PROVER_ERROR',
      error: err.message || 'Prover failed',
    }).catch(() => {});
  }
}
