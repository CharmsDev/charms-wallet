/**
 * Bitcoin funding UTXO selection helpers.
 *
 * `selectBtcFunding`            → single UTXO (legacy, kept for callers that want it).
 * `selectBtcFundingAccumulated` → multi-UTXO accumulator: {funding, extras}.
 */

import { isCharmUtxo, isPotentialCharm } from '@/services/utxo/utils/charms';
import { isSpent } from '@/services/utxo-reservations';

/** Minimum sats for a usable funding UTXO. */
export const MIN_FUNDING_SATS = 5000;

/** Normalise a wallet UTXO to a stable shape used by callers. */
function toResult(u) {
  const vout = u.outputIndex !== undefined ? u.outputIndex : u.vout;
  return {
    txid: u.txid,
    vout,
    value: u.value || u.amount,
    utxoId: `${u.txid}:${vout}`,
  };
}

/** Filter spendable non-charm UTXOs sorted largest first. */
function spendableSortedDesc(utxos, charms, excludeUtxoIds) {
  const exclude = new Set(excludeUtxoIds);
  return (Array.isArray(utxos) ? utxos : [])
    .filter(u => {
      const value = u.value || u.amount || 0;
      if (value <= 0) return false;
      const vout = u.outputIndex !== undefined ? u.outputIndex : u.vout;
      if (exclude.has(`${u.txid}:${vout}`)) return false;
      if (isPotentialCharm(u)) return false;
      if (isCharmUtxo(u, charms)) return false;
      if (isSpent('bitcoin', u.txid, vout)) return false;
      return true;
    })
    .sort((a, b) => (b.value || b.amount || 0) - (a.value || a.amount || 0));
}

/**
 * Pick the single largest non-charm UTXO ≥ minSats.
 * Returns `{txid, vout, value, utxoId}` or `null`.
 */
export function selectBtcFunding(utxos, charms = [], opts = {}) {
  const { minSats = MIN_FUNDING_SATS, excludeUtxoIds = [] } = opts;
  const candidates = spendableSortedDesc(utxos, charms, excludeUtxoIds)
    .filter(u => (u.value || u.amount || 0) >= minSats);
  return candidates.length ? toResult(candidates[0]) : null;
}

/**
 * Accumulate non-charm UTXOs (largest first) until the running total ≥ minSats.
 * The first UTXO becomes `funding`; the rest go in `extras` (may be empty).
 * Single-UTXO scenarios behave identically to `selectBtcFunding`.
 *
 * @returns {{ funding, extras, totalSats } | null}
 */
export function selectBtcFundingAccumulated(utxos, charms = [], opts = {}) {
  const { minSats = MIN_FUNDING_SATS, excludeUtxoIds = [] } = opts;
  const candidates = spendableSortedDesc(utxos, charms, excludeUtxoIds);
  if (!candidates.length) return null;

  const picked = [];
  let total = 0;
  for (const u of candidates) {
    picked.push(u);
    total += u.value || u.amount || 0;
    if (total >= minSats) break;
  }
  if (total < minSats) return null;

  return {
    funding: toResult(picked[0]),
    extras: picked.slice(1).map(toResult),
    totalSats: total,
  };
}

/**
 * Beam readiness — single-UTXO threshold removed: we accept any combination
 * of non-charm UTXOs whose total ≥ minSats, since callers can now accumulate.
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
  return { ok: true, totalSats };
}
