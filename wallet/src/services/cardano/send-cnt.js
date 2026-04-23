/**
 * Cardano Native Token (CNT) transfer.
 *
 * Sends a given quantity of a CNT (policyId + assetName) from our wallet to
 * another Cardano address. Reuses the ADA send pipeline where possible; the
 * delta is:
 *   - we must include the token-bearing UTxO(s) as inputs
 *   - the recipient output has to carry the token AND enough ADA to satisfy
 *     the per-utxo minimum (≈1.2-1.5 ADA for a single-token output)
 *   - leftover ADA + leftover tokens return to us via `add_change_if_needed`
 *   - extra pure-ADA funding inputs may be required if the token UTxO is lean
 */

import { fetchUtxos } from './api';
import { getSpentSet, markBatch } from '@/services/utxo-reservations';
import { loadCsl, createTxBuilder, signAndSubmit, toCardanoNet, loadProtocolParams } from './tx-builder';

/** Fallback when CSL's min-ADA helper is unavailable; generous but safe. */
const FALLBACK_MIN_ADA = 1_500_000n; // 1.5 ADA

/** Fee + change safety buffer on top of the recipient output. */
const FEE_AND_CHANGE_MARGIN = 1_500_000n; // 1.5 ADA

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Rebuild a UTxO's on-chain Value (ADA + any tokens it carries) so CSL's
 * balancing logic sees what's really inside the input. Without this, change
 * computation would believe we lost the tokens present in `u.assets`.
 */
function inputValue(CSL, u) {
  const value = CSL.Value.new(CSL.BigNum.from_str(String(u.lovelace || '0')));
  if (!u.assets?.length) return value;

  // Group assets by policyId so one insert covers all assets in that policy.
  const byPolicy = new Map();
  for (const a of u.assets) {
    const pid = a.unit.slice(0, 56);
    const an = a.unit.slice(56);
    if (!byPolicy.has(pid)) byPolicy.set(pid, []);
    byPolicy.get(pid).push({ an, qty: a.quantity });
  }

  const ma = CSL.MultiAsset.new();
  for (const [pid, entries] of byPolicy) {
    const scriptHash = CSL.ScriptHash.from_bytes(hexToBytes(pid));
    const assets = CSL.Assets.new();
    for (const { an, qty } of entries) {
      assets.insert(CSL.AssetName.new(hexToBytes(an)), CSL.BigNum.from_str(String(qty)));
    }
    ma.insert(scriptHash, assets);
  }
  value.set_multiasset(ma);
  return value;
}

/**
 * Compute the exact min-ADA required for an output carrying the given
 * multi-asset. Falls back to a conservative constant if CSL exposes a
 * different helper in this version.
 */
function computeMinAda(CSL, toAddr, multiAsset, coinsPerUtxoSize) {
  try {
    const value = CSL.Value.new(CSL.BigNum.from_str('1000000'));
    value.set_multiasset(multiAsset);
    const output = CSL.TransactionOutput.new(toAddr, value);
    const dataCost = CSL.DataCost.new_coins_per_byte(
      CSL.BigNum.from_str(String(coinsPerUtxoSize || '4310')),
    );
    const min = CSL.min_ada_for_output(output, dataCost);
    return BigInt(min.to_str());
  } catch {
    return FALLBACK_MIN_ADA;
  }
}

/**
 * Send `quantity` of the token (policyId, assetName) from `fromAddress` to
 * `toAddress`. `quantity` is in raw token units (no decimals).
 *
 * @returns {Promise<{ txHash: string }>}
 */
export async function sendCnt({
  fromAddress,
  toAddress,
  policyId,
  assetName,
  quantity,
  seedPhrase,
  addressIndex = 0,
  network,
  onStatus,
}) {
  if (!fromAddress) throw new Error('Missing sender address');
  if (!toAddress) throw new Error('Missing recipient address');
  if (!policyId || assetName == null) throw new Error('Missing asset identifier');
  if (!seedPhrase) throw new Error('Wallet is locked');

  const qty = BigInt(quantity);
  if (qty <= 0n) throw new Error('Quantity must be positive');

  const cardanoNet = toCardanoNet(network);
  const CSL = await loadCsl();

  try { CSL.Address.from_bech32(toAddress); } catch { throw new Error('Invalid recipient address'); }
  const fromAddr = CSL.Address.from_bech32(fromAddress);
  const toAddr = CSL.Address.from_bech32(toAddress);

  onStatus?.('Fetching UTXOs...');
  const utxos = await fetchUtxos(fromAddress, cardanoNet);
  const reserved = getSpentSet('cardano');
  const unit = policyId + assetName;

  // 1. Pick UTxOs that hold this token, biggest-balance-first so we usually
  //    satisfy the quantity in a single input.
  const tokenUtxos = utxos
    .filter(u => !reserved.has(`${u.txHash}:${u.outputIndex}`))
    .filter(u => (u.assets || []).some(a => a.unit === unit))
    .map(u => ({
      ...u,
      _tokenQty: BigInt((u.assets || []).find(a => a.unit === unit)?.quantity || '0'),
    }))
    .sort((a, b) => Number(b._tokenQty - a._tokenQty));

  const tokenInputs = [];
  let haveQty = 0n;
  let adaFromTokens = 0n;
  for (const u of tokenUtxos) {
    tokenInputs.push(u);
    haveQty += u._tokenQty;
    adaFromTokens += BigInt(u.lovelace || '0');
    if (haveQty >= qty) break;
  }
  if (haveQty < qty) {
    throw new Error(`Insufficient token balance. Have ${haveQty}, need ${qty}.`);
  }

  // 2. Assemble the recipient output's MultiAsset and compute min-ADA.
  const policyBytes = hexToBytes(policyId);
  const scriptHash = CSL.ScriptHash.from_bytes(policyBytes);
  const assetNameObj = CSL.AssetName.new(hexToBytes(assetName));

  const recipientAssets = CSL.Assets.new();
  recipientAssets.insert(assetNameObj, CSL.BigNum.from_str(qty.toString()));
  const recipientMa = CSL.MultiAsset.new();
  recipientMa.insert(scriptHash, recipientAssets);

  const params = await loadProtocolParams(cardanoNet);
  const minAda = computeMinAda(CSL, toAddr, recipientMa, params.coins_per_utxo_size);

  // 3. Add pure-ADA funding inputs if token UTxOs don't carry enough lovelace
  //    to cover the recipient output + fee + change buffer.
  const fundingNeed = (minAda + FEE_AND_CHANGE_MARGIN) - adaFromTokens;
  const extraInputs = [];
  if (fundingNeed > 0n) {
    const pureAda = utxos
      .filter(u => (!u.assets || u.assets.length === 0))
      .filter(u => !reserved.has(`${u.txHash}:${u.outputIndex}`))
      .filter(u => !tokenInputs.some(ti => ti.txHash === u.txHash && ti.outputIndex === u.outputIndex))
      .sort((a, b) => Number(BigInt(b.lovelace || '0') - BigInt(a.lovelace || '0')));

    let extraSum = 0n;
    for (const u of pureAda) {
      extraInputs.push(u);
      extraSum += BigInt(u.lovelace || '0');
      if (extraSum >= fundingNeed) break;
    }
    if (extraSum < fundingNeed) {
      throw new Error(
        `Insufficient ADA to cover token output + fees. ` +
        `Need ${(Number(fundingNeed - extraSum) / 1e6).toFixed(6)} more ADA.`,
      );
    }
  }

  // 4. Build the transaction.
  onStatus?.('Building transaction...');
  const txBuilder = createTxBuilder(CSL, params);

  const allInputs = [...tokenInputs, ...extraInputs];
  for (const u of allInputs) {
    txBuilder.add_regular_input(
      fromAddr,
      CSL.TransactionInput.new(CSL.TransactionHash.from_hex(u.txHash), u.outputIndex),
      inputValue(CSL, u),
    );
  }

  const recipientValue = CSL.Value.new(CSL.BigNum.from_str(minAda.toString()));
  recipientValue.set_multiasset(recipientMa);
  txBuilder.add_output(CSL.TransactionOutput.new(toAddr, recipientValue));

  // CSL computes fee, packs leftover lovelace + residual tokens into change.
  txBuilder.add_change_if_needed(fromAddr);

  const { txHash, feeLovelace } = await signAndSubmit(CSL, txBuilder, {
    seedPhrase,
    addressIndex,
    cardanoNet,
    onStatus,
  });

  markBatch('cardano', allInputs);

  // Expected ADA change returning to us (leftover lovelace after the token
  // output + fee). Useful for optimistic balance updates on the dashboard.
  const totalAdaIn = allInputs.reduce((s, u) => s + BigInt(u.lovelace || '0'), 0n);
  const changeLovelace = totalAdaIn - minAda - feeLovelace;

  return { txHash, feeLovelace, changeLovelace };
}
