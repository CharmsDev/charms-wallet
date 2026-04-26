/**
 * Cardano CNT UTXO selector — accumulator pattern.
 *
 * Returns enough CNT UTXOs (largest-first) to cover `requiredAmount` of the
 * given asset. Used by ADA→BTC beam-out and eBTC redeem so the spell's token
 * math stays balanced when the user's CNT is fragmented across UTXOs.
 */

import { fetchUtxos } from '@/services/cardano/api';
import { getSpentSet } from '@/services/utxo-reservations';

function toCardanoNet(network) {
  if (!network) return undefined;
  return network === 'mainnet' ? 'mainnet' : 'preprod';
}

/**
 * @param {string} address     Cardano bech32 address holding the CNTs
 * @param {string} assetUnit   `policy_id || asset_name_hex` (Blockfrost/Koios "unit")
 * @param {bigint|number} requiredAmount  Minimum CNT amount to cover
 * @param {string} network
 * @returns {Promise<{ inputs: Array<{utxoId,txHash,outputIndex,amount}>, totalAmount: bigint }>}
 */
export async function selectCntUtxos(address, assetUnit, requiredAmount, network) {
  const required = BigInt(requiredAmount);
  if (required <= 0n) throw new Error('selectCntUtxos: requiredAmount must be > 0');

  const utxos = await fetchUtxos(address, toCardanoNet(network));
  const reserved = getSpentSet('cardano');

  const candidates = utxos
    .map(u => {
      const utxoId = `${u.txHash}:${u.outputIndex}`;
      const asset = (u.assets || []).find(a => a.unit === assetUnit);
      if (!asset) return null;
      if (reserved.has(utxoId)) return null;
      return {
        utxoId,
        txHash: u.txHash,
        outputIndex: u.outputIndex,
        amount: BigInt(asset.quantity || '0'),
      };
    })
    .filter(Boolean)
    .filter(c => c.amount > 0n)
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));

  if (!candidates.length) {
    throw new Error(`No CNT UTXOs found at ${address} for asset ${assetUnit}`);
  }

  const totalAvailable = candidates.reduce((s, c) => s + c.amount, 0n);
  if (totalAvailable < required) {
    throw new Error(
      `Insufficient CNT balance: have ${totalAvailable}, need ${required}.`
    );
  }

  const picked = [];
  let totalAmount = 0n;
  for (const c of candidates) {
    picked.push(c);
    totalAmount += c.amount;
    if (totalAmount >= required) break;
  }

  return { inputs: picked, totalAmount };
}
