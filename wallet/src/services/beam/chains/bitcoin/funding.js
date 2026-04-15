/**
 * Bitcoin funding UTXO selection helper.
 *
 * Selects a non-charm UTXO with enough sats to cover beam fees.
 * Used by both regular beams and eBTC mint+beam flows.
 */

import { isCharmUtxo, isPotentialCharm } from '@/services/utxo/utils/charms';

/** Minimum sats for a usable funding UTXO. */
export const MIN_FUNDING_SATS = 5000;

/**
 * Select a Bitcoin funding UTXO.
 *
 * Filters out:
 *   - Charm UTXOs (matched against charms list)
 *   - Potential charm UTXOs (≤1000 sats heuristic)
 *   - UTXOs explicitly excluded
 *   - UTXOs below minSats threshold
 *
 * Returns largest available so we don't fragment too quickly.
 *
 * @param {Array} utxos - Wallet UTXOs (from utxoStore or fetcher)
 * @param {Array} charms - Known charm UTXOs (to exclude)
 * @param {object} [opts]
 * @param {number} [opts.minSats=5000]
 * @param {Array<string>} [opts.excludeUtxoIds] - "txid:vout" strings to skip
 * @returns {object | null} - { txid, vout, value, utxoId } or null
 */
export function selectBtcFunding(utxos, charms = [], opts = {}) {
  const { minSats = MIN_FUNDING_SATS, excludeUtxoIds = [] } = opts;
  const exclude = new Set(excludeUtxoIds);

  if (!Array.isArray(utxos)) return null;

  const candidates = utxos.filter(u => {
    const value = u.value || u.amount || 0;
    const txid = u.txid;
    const vout = u.outputIndex !== undefined ? u.outputIndex : u.vout;
    const utxoId = `${txid}:${vout}`;

    if (exclude.has(utxoId)) return false;
    if (value < minSats) return false;
    if (isPotentialCharm(u)) return false;
    if (isCharmUtxo(u, charms)) return false;
    return true;
  });

  if (!candidates.length) return null;

  // Sort largest first (don't fragment small UTXOs)
  candidates.sort((a, b) => (b.value || b.amount || 0) - (a.value || a.amount || 0));

  const u = candidates[0];
  return {
    txid: u.txid,
    vout: u.outputIndex !== undefined ? u.outputIndex : u.vout,
    value: u.value || u.amount,
    utxoId: `${u.txid}:${u.outputIndex !== undefined ? u.outputIndex : u.vout}`,
  };
}

/**
 * Check Bitcoin beam readiness — verify there's enough non-charm sats for a beam.
 *
 * @param {Array} utxos
 * @param {Array} charms
 * @param {number} [minSats]
 * @returns {{ ok: boolean, totalSats: number, message?: string }}
 */
export function checkBtcBeamReadiness(utxos, charms = [], minSats = MIN_FUNDING_SATS) {
  if (!Array.isArray(utxos) || utxos.length === 0) {
    return { ok: false, totalSats: 0, message: 'No Bitcoin UTXOs found.' };
  }

  const spendable = utxos.filter(u => !isPotentialCharm(u) && !isCharmUtxo(u, charms));
  const totalSats = spendable.reduce((s, u) => s + (u.value || u.amount || 0), 0);

  if (totalSats < minSats) {
    return {
      ok: false,
      totalSats,
      message: `Insufficient Bitcoin sats. Have ${totalSats}, need at least ${minSats}.`,
    };
  }

  const hasFunding = spendable.some(u => (u.value || u.amount || 0) >= minSats);
  if (!hasFunding) {
    return {
      ok: false,
      totalSats,
      message: `Need a single UTXO ≥ ${minSats} sats. Largest is ${Math.max(...spendable.map(u => u.value || u.amount || 0))}.`,
    };
  }

  return { ok: true, totalSats };
}
