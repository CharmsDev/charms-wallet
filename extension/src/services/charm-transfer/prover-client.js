/**
 * Prover API Client for Charm Transfers
 * Sends a NormalizedProveRequest to the v10 prover and returns the signed TX hex.
 *
 * Prover URL: https://v10.charms.dev/spells/prove
 * Response: [{ "bitcoin": "<raw_tx_hex>" }]
 */

const PROVER_URL_MAINNET = import.meta.env.VITE_PROVER_MAINNET_URL || 'https://v10.charms.dev/spells/prove';
const PROVER_URL_TESTNET = import.meta.env.VITE_PROVER_TESTNET4_URL || 'https://prove-t4.charms.dev';

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5000;

function getProverUrl(network) {
  return network === 'mainnet' ? PROVER_URL_MAINNET : PROVER_URL_TESTNET;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Send prove request to the prover with retries.
 *
 * @param {object} payload  NormalizedProveRequest
 * @param {string} network  'mainnet' | 'testnet4'
 * @param {function} onStatus  (msg: string) => void
 * @returns {string} raw tx hex
 */
export async function proveTransfer(payload, network, onStatus) {
  const url = getProverUrl(network);
  onStatus?.(`Sending to prover (${url})…`);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      onStatus?.(`Prover attempt ${attempt}/${MAX_ATTEMPTS}…`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Prover HTTP ${res.status}: ${text.slice(0, 200)}`);
      }

      const data = await res.json();

      if (!Array.isArray(data) || data.length < 1) {
        throw new Error('Invalid prover response: expected array with ≥1 TX');
      }

      const first = data[0];
      const txHex = typeof first === 'string' ? first : first?.bitcoin;
      if (!txHex || typeof txHex !== 'string') {
        throw new Error('Prover response missing TX hex');
      }

      onStatus?.('Prover succeeded ✓');
      return txHex;

    } catch (err) {
      if (attempt < MAX_ATTEMPTS) {
        onStatus?.(`Prover attempt ${attempt} failed, retrying… (${err.message})`);
        await sleep(RETRY_DELAY_MS);
      } else {
        throw err;
      }
    }
  }
}
