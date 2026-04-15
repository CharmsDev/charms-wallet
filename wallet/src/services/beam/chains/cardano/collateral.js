/**
 * Cardano collateral UTXO selector.
 *
 * Plutus transactions require a collateral input that is forfeited if script fails.
 * We select a pure-ADA UTXO (no tokens) with enough lovelace.
 *
 * Uses normalized UTXO format: { txHash, outputIndex, lovelace, assets }
 */

import { fetchCardanoUtxos } from './api';

const MIN_COLLATERAL_LOVELACE = 2_000_000n; // 2 ADA

/**
 * @param {string} address - Bech32 Cardano address
 * @param {string} [excludeTxHash] - Exclude UTXOs from this tx (e.g. placeholder)
 * @returns {Promise<{ txHash: string, outputIndex: number, lovelace: string }>}
 */
export async function selectCollateralUtxo(address, excludeTxHash) {
  const utxos = await fetchCardanoUtxos(address);

  const candidates = utxos
    .filter(u => !u.assets || u.assets.length === 0) // Pure ADA, no tokens
    .filter(u => !excludeTxHash || u.txHash !== excludeTxHash) // Exclude placeholder tx
    .filter(u => BigInt(u.lovelace || '0') >= MIN_COLLATERAL_LOVELACE)
    .sort((a, b) => {
      const aVal = BigInt(a.lovelace || '0');
      const bVal = BigInt(b.lovelace || '0');
      return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    });

  if (!candidates.length) {
    throw new Error(
      `No suitable Cardano UTXO for collateral (need >= 2 ADA, pure lovelace). Have ${utxos.length} UTXOs.`
    );
  }

  const u = candidates[0];
  return {
    txHash: u.txHash,
    outputIndex: u.outputIndex,
    lovelace: u.lovelace,
  };
}
