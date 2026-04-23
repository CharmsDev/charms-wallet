/**
 * Native ADA transfer.
 *
 * Builds, signs, and submits a simple pure-ADA transaction from `fromAddress`
 * to `toAddress`. Respects UTXO reservations (so an in-flight beam keeps its
 * placeholder/collateral/funding) and registers the consumed inputs as spent
 * AFTER a successful broadcast.
 */

import { fetchUtxos } from './api';
import { getSpentSet, markBatch } from '@/services/utxo-reservations';
import { loadCsl, createTxBuilder, signAndSubmit, toCardanoNet, loadProtocolParams } from './tx-builder';

/** Minimum ADA we allow users to send. Below this, UTxO economics get noisy. */
const MIN_SEND_LOVELACE = 1_000_000n; // 1 ADA

/**
 * Safety margin above the send amount to cover fee + a healthy change UTxO.
 * CSL computes the real fee inside `add_change_if_needed`; the margin just
 * ensures we select enough inputs upfront.
 */
const FEE_AND_CHANGE_MARGIN = 1_500_000n; // 1.5 ADA

/**
 * Send `lovelace` from `fromAddress` to `toAddress`.
 *
 * @returns {Promise<{ txHash: string }>}
 */
export async function sendAda({
  fromAddress,
  toAddress,
  lovelace,
  seedPhrase,
  addressIndex = 0,
  network,
  onStatus,
}) {
  if (!fromAddress) throw new Error('Missing sender address');
  if (!toAddress) throw new Error('Missing recipient address');
  if (!seedPhrase) throw new Error('Wallet is locked');

  const amount = BigInt(lovelace);
  if (amount < MIN_SEND_LOVELACE) {
    throw new Error(`Minimum send is ${Number(MIN_SEND_LOVELACE) / 1e6} ADA`);
  }

  const cardanoNet = toCardanoNet(network);
  const CSL = await loadCsl();

  // Validate addresses (throws if malformed)
  try { CSL.Address.from_bech32(toAddress); } catch { throw new Error('Invalid recipient address'); }
  const fromAddr = CSL.Address.from_bech32(fromAddress);
  const toAddr = CSL.Address.from_bech32(toAddress);

  onStatus?.('Fetching UTXOs...');
  const utxos = await fetchUtxos(fromAddress, cardanoNet);
  const reserved = getSpentSet('cardano');

  // Select pure-ADA UTxOs (skip anything holding tokens) that aren't reserved
  // by another in-flight operation. Largest-first keeps input count small.
  const candidates = utxos
    .filter(u => !u.assets || u.assets.length === 0)
    .filter(u => !reserved.has(`${u.txHash}:${u.outputIndex}`))
    .sort((a, b) => Number(BigInt(b.lovelace || '0') - BigInt(a.lovelace || '0')));

  const selected = [];
  let total = 0n;
  const target = amount + FEE_AND_CHANGE_MARGIN;
  for (const u of candidates) {
    selected.push(u);
    total += BigInt(u.lovelace || '0');
    if (total >= target) break;
  }

  if (total < target) {
    throw new Error(
      `Insufficient ADA. Have ${(Number(total) / 1e6).toFixed(6)} available, ` +
      `need ≥ ${(Number(target) / 1e6).toFixed(6)} (amount + fee buffer).`,
    );
  }

  onStatus?.('Building transaction...');
  const params = await loadProtocolParams(cardanoNet);
  const txBuilder = createTxBuilder(CSL, params);

  for (const u of selected) {
    txBuilder.add_regular_input(
      fromAddr,
      CSL.TransactionInput.new(CSL.TransactionHash.from_hex(u.txHash), u.outputIndex),
      CSL.Value.new(CSL.BigNum.from_str(String(u.lovelace))),
    );
  }

  txBuilder.add_output(
    CSL.TransactionOutput.new(toAddr, CSL.Value.new(CSL.BigNum.from_str(amount.toString()))),
  );

  // CSL auto-computes the exact fee here and refunds the rest to the sender.
  txBuilder.add_change_if_needed(fromAddr);

  const { txHash, feeLovelace } = await signAndSubmit(CSL, txBuilder, {
    seedPhrase,
    addressIndex,
    cardanoNet,
    onStatus,
  });

  // Reserve consumed UTxOs AFTER broadcast so concurrent ops skip them.
  markBatch('cardano', selected);

  // Expected change that returns to us, for optimistic balance display.
  const changeLovelace = total - amount - feeLovelace;

  return { txHash, feeLovelace, changeLovelace };
}
