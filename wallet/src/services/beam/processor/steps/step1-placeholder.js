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
 * @param {number} [p.addressIndex=0]
 * @param {function} [p.onStatus]
 * @returns {Promise<{ txHash: string, outputIndex: number }>}
 */
export async function createPlaceholder({ cardanoAddress, seedPhrase, addressIndex = 0, onStatus }) {
  // Load CSL dynamically
  const { waitForCardanoWasm, getCardanoWasm } = await import('@/lib/cardano/cardanoWasm');
  await waitForCardanoWasm();
  const CSL = getCardanoWasm();
  const { seedPhraseToRootKey, derivePaymentKey } = await import('@/lib/cardano/wallet');

  // Fetch UTXOs (normalized format: { txHash, outputIndex, lovelace, assets })
  onStatus?.('Fetching Cardano UTXOs...');
  const utxos = await fetchUtxos(cardanoAddress);
  if (!utxos.length) throw new Error('No Cardano UTXOs available. Fund your Cardano address with at least 4 ADA.');

  // Fetch protocol parameters
  onStatus?.('Fetching protocol parameters...');
  const params = await getProtocolParams();

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

  // Add input
  const inputTxHash = CSL.TransactionHash.from_hex(funding.txHash);
  const input = CSL.TransactionInput.new(inputTxHash, funding.outputIndex);
  txBuilder.add_regular_input(
    CSL.Address.from_bech32(cardanoAddress),
    input,
    CSL.Value.new(CSL.BigNum.from_str(fundingLovelace.toString()))
  );

  // Add placeholder output (min ADA, no tokens)
  const destAddr = CSL.Address.from_bech32(cardanoAddress);
  txBuilder.add_output(
    CSL.TransactionOutput.new(destAddr, CSL.Value.new(CSL.BigNum.from_str(minUtxo)))
  );

  // Change back to same address
  txBuilder.add_change_if_needed(destAddr);

  // Build unsigned tx, then use FixedTransaction for hashing + signing
  const txBody = txBuilder.build();
  const unsignedTx = CSL.Transaction.new(txBody, CSL.TransactionWitnessSet.new());
  const fixedTx = CSL.FixedTransaction.from_bytes(unsignedTx.to_bytes());

  onStatus?.('Signing Cardano transaction...');
  const rootKey = await seedPhraseToRootKey(seedPhrase);
  const paymentKey = await derivePaymentKey(rootKey, addressIndex);
  fixedTx.sign_and_add_vkey_signature(paymentKey.to_raw_key());

  // Submit
  onStatus?.('Submitting placeholder transaction...');
  const submittedHash = await submitCardanoTx(fixedTx.to_bytes());
  const finalHash = fixedTx.transaction_hash().to_hex();

  return {
    txHash: typeof submittedHash === 'string' ? submittedHash : finalHash,
    outputIndex: 0,
  };
}
