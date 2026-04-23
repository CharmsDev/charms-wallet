/**
 * Shared Cardano transaction-builder helpers.
 *
 * Centralizes the CSL boilerplate that was previously duplicated across
 * beam steps (placeholder, funding split, consolidation). New features
 * (native ADA/CNT send) build on top of these.
 *
 * Responsibilities:
 *   - load + cache CSL WASM
 *   - map wallet network → Cardano provider network
 *   - build a TransactionBuilder with protocol-param defaults
 *   - sign + submit using the standard CIP-1852 payment key path
 */

import { getProtocolParams, submitCardanoTx } from './api';

/** Lazy-load the CSL wasm module (browser-only). */
export async function loadCsl() {
  const { waitForCardanoWasm, getCardanoWasm } = await import('@/lib/cardano/cardanoWasm');
  await waitForCardanoWasm();
  return getCardanoWasm();
}

/**
 * Normalize a wallet-level network identifier to the Cardano provider form.
 * Accepts 'mainnet', 'testnet4', 'preprod', undefined.
 * Returns 'mainnet' | 'preprod' | undefined.
 */
export function toCardanoNet(network) {
  if (!network) return undefined;
  return network === 'mainnet' ? 'mainnet' : 'preprod';
}

/**
 * Build a TransactionBuilder preconfigured with protocol parameters.
 * All helpers that build txs should start from here so fee/min-utxo/limit
 * defaults stay consistent.
 */
export function createTxBuilder(CSL, params) {
  return CSL.TransactionBuilder.new(
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
      .build(),
  );
}

/**
 * Sign + submit a fully-constructed TransactionBuilder.
 * Returns the tx hash + exact fee (useful for optimistic balance updates).
 */
export async function signAndSubmit(CSL, txBuilder, { seedPhrase, addressIndex = 0, cardanoNet, onStatus }) {
  const { seedPhraseToRootKey, derivePaymentKey } = await import('@/lib/cardano/wallet');

  const txBody = txBuilder.build();
  const feeLovelace = BigInt(txBody.fee().to_str());
  const unsigned = CSL.Transaction.new(txBody, CSL.TransactionWitnessSet.new());
  const fixed = CSL.FixedTransaction.from_bytes(unsigned.to_bytes());

  onStatus?.('Signing transaction...');
  const rootKey = await seedPhraseToRootKey(seedPhrase);
  const paymentKey = await derivePaymentKey(rootKey, addressIndex);
  fixed.sign_and_add_vkey_signature(paymentKey.to_raw_key());

  onStatus?.('Submitting transaction...');
  const submitted = await submitCardanoTx(fixed.to_bytes(), cardanoNet);
  const localHash = fixed.transaction_hash().to_hex();
  const txHash = typeof submitted === 'string' ? submitted : localHash;
  return { txHash, feeLovelace };
}

/** Pull the freshest protocol params for the given Cardano network. */
export async function loadProtocolParams(cardanoNet) {
  return getProtocolParams(cardanoNet);
}
