/**
 * Step 1: Create placeholder UTXO on Cardano.
 *
 * Builds a minimal Cardano tx with one output (min ADA, no tokens).
 * This placeholder is later consumed by the claim tx.
 *
 * Input:  cardanoAddress, seedPhrase
 * Output: { txHash, outputIndex }
 */

import { fetchUtxos, getProtocolParams } from '@/services/cardano/api';
import { submitCardanoTx } from '@/services/cardano/api';

/**
 * @param {object} p
 * @param {string} p.cardanoAddress
 * @param {string} p.seedPhrase
 * @param {string} [p.adaNetwork]   — Cardano network ('mainnet' | 'preprod')
 * @param {string} [p.network]       — Bitcoin network (used as fallback for ADA when same-named)
 * @param {number} [p.addressIndex=0]
 * @param {function} [p.onStatus]
 * @returns {Promise<{ txHash: string, outputIndex: number }>}
 */
export async function createPlaceholder({ cardanoAddress, cardanoOwnAddress, seedPhrase, adaNetwork, network, addressIndex = 0, onStatus }) {
  // Resolve which Cardano network to query. Prefer `adaNetwork` from the
  // dialog payload; fall back to mapping the BTC `network` (mainnet→mainnet,
  // anything else→preprod). Never rely on getNetwork()'s localStorage read —
  // it returns 'preprod' if the active_blockchain key is missing (e.g.
  // immediately after a schema wipe).
  const cardanoNet = adaNetwork || (network === 'mainnet' ? 'mainnet' : 'preprod');

  // The placeholder MUST live at our own address so step6 can spend it to
  // complete the claim. `cardanoAddress` (destination) only matters for the
  // final claim output where beamed tokens land. Fall back to `cardanoAddress`
  // for legacy callers that only pass one address (same-wallet beams).
  const ownAddr = cardanoOwnAddress || cardanoAddress;

  // Load CSL dynamically
  const { waitForCardanoWasm, getCardanoWasm } = await import('@/lib/cardano/cardanoWasm');
  await waitForCardanoWasm();
  const CSL = getCardanoWasm();
  const { seedPhraseToRootKey, derivePaymentKey } = await import('@/lib/cardano/wallet');

  // Fetch UTXOs from OUR address (where we can actually spend)
  onStatus?.('Fetching Cardano UTXOs...');
  const utxos = await fetchUtxos(ownAddr, cardanoNet);
  if (!utxos.length) throw new Error('No Cardano UTXOs available. Fund your Cardano address with at least 4 ADA.');

  // Fetch protocol parameters
  onStatus?.('Fetching protocol parameters...');
  const params = await getProtocolParams(cardanoNet);

  // Select largest UTXO for funding
  const sorted = [...utxos].sort((a, b) =>
    BigInt(b.lovelace || '0') > BigInt(a.lovelace || '0') ? 1 : -1
  );
  const funding = sorted[0];
  const fundingLovelace = BigInt(funding.lovelace || '0');
  const minUtxo = params.coins_per_utxo_size ? String(parseInt(params.coins_per_utxo_size) * 300) : '1000000';

  onStatus?.('Building placeholder transaction...');

  // Build tx with CSL
  const txBuilder = CSL.TransactionBuilder.new(
    CSL.TransactionBuilderConfigBuilder.new()
      .fee_algo(CSL.LinearFee.new(
        CSL.BigNum.from_str(String(params.min_fee_a || '44')),
        CSL.BigNum.from_str(String(params.min_fee_b || '155381')),
      ))
      .pool_deposit(CSL.BigNum.from_str(String(params.pool_deposit || '500000000')))
      .key_deposit(CSL.BigNum.from_str(String(params.key_deposit || '2000000')))
      .coins_per_utxo_byte(CSL.BigNum.from_str(String(params.coins_per_utxo_size || '4310')))
      .max_tx_size(parseInt(params.max_tx_size) || 16384)
      .max_value_size(parseInt(params.max_val_size) || 5000)
      .build()
  );

  // Add input (funding UTXO lives at our own address)
  const inputTxHash = CSL.TransactionHash.from_hex(funding.txHash);
  const input = CSL.TransactionInput.new(inputTxHash, funding.outputIndex);
  txBuilder.add_regular_input(
    CSL.Address.from_bech32(ownAddr),
    input,
    CSL.Value.new(CSL.BigNum.from_str(fundingLovelace.toString()))
  );

  // All outputs (placeholder + optional collateral + change) go to OUR
  // address so step6 can spend them. Sending tokens to the final destination
  // happens in the claim step, not here.
  const destAddr = CSL.Address.from_bech32(ownAddr);
  txBuilder.add_output(
    CSL.TransactionOutput.new(destAddr, CSL.Value.new(CSL.BigNum.from_str(minUtxo)))
  );

  // Dedicated collateral output (3 ADA) so step6 always has a separate UTXO
  // for collateral AND funding. Without this, a wallet starting with a single
  // large UTXO ends up with only 1 pure-ADA UTXO after step1, which blocks
  // funding selection (collateral and funding must be distinct inputs).
  const collateralLovelace = 3_000_000n;
  if (fundingLovelace >= BigInt(minUtxo) + collateralLovelace + 8_000_000n) {
    txBuilder.add_output(
      CSL.TransactionOutput.new(destAddr, CSL.Value.new(CSL.BigNum.from_str(collateralLovelace.toString())))
    );
  }

  // Change back to same address (this becomes the funding UTXO for step6)
  txBuilder.add_change_if_needed(destAddr);

  // Build unsigned tx, then use FixedTransaction for hashing + signing
  const txBody = txBuilder.build();
  const unsignedTx = CSL.Transaction.new(txBody, CSL.TransactionWitnessSet.new());
  const fixedTx = CSL.FixedTransaction.from_bytes(unsignedTx.to_bytes());

  onStatus?.('Signing Cardano transaction...');
  const rootKey = await seedPhraseToRootKey(seedPhrase);
  const paymentKey = await derivePaymentKey(rootKey, addressIndex);
  fixedTx.sign_and_add_vkey_signature(paymentKey.to_raw_key());

  // Submit (explicit network — see top-of-function comment)
  onStatus?.('Submitting placeholder transaction...');
  const submittedHash = await submitCardanoTx(fixedTx.to_bytes(), cardanoNet);
  const finalHash = fixedTx.transaction_hash().to_hex();

  const placeholderTxHash = typeof submittedHash === 'string' ? submittedHash : finalHash;

  // Reserve both the input (funding UTXO, now spent) and the placeholder
  // output (must be preserved for the claim) so concurrent beams or
  // consolidate/split operations don't touch them.
  try {
    const { markBatch } = await import('@/services/utxo-reservations');
    markBatch('cardano', [
      { txHash: funding.txHash, outputIndex: funding.outputIndex },
      { txHash: placeholderTxHash, outputIndex: 0 },
    ]);
  } catch (e) { console.warn('[Step1Placeholder] reserve failed:', e?.message); }

  return {
    txHash: placeholderTxHash,
    outputIndex: 0,
  };
}
