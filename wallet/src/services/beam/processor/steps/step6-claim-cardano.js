/**
 * Step 6: Claim beamed tokens on Cardano via the prover.
 *
 * The prover generates ZK proof, builds Cardano tx, and calls Scrolls for signature.
 * We then add our own signature and submit to Cardano.
 *
 * Input:  tokenAppId, placeholderTxid, placeholderVout, btcTxid, beamAmount,
 *         cardanoAddress, seedPhrase, network
 * Output: { adaClaimTxid }
 */

import { fetchBtcTxWithProof } from '../../chains/bitcoin/proof';
import { prepareCollateralAndFunding } from '../../chains/cardano/funding';
import { buildClaimSpell } from '../../spells/claim-builder';
import { normalizeClaimSpell } from '../../spells/claim-normalizer';
import { buildClaimPayload, submitClaimToProver } from '../../spells/claim-payload';

export async function claimOnCardano({
  tokenAppId, placeholderTxid, placeholderVout,
  btcTxid, beamAmount, cardanoAddress, cardanoOwnAddress, seedPhrase, addressIndex = 0, network, onStatus,
  claimTxCborHex,  // optional: pre-proven tx cbor (skip prover if provided)
  onProved,        // optional: called with proverResponseHex after prover returns (for persistence)
}) {
  // cardanoAddress = destination for beamed tokens (may be own or other)
  // cardanoOwnAddress = our address that pays fees, collateral, funding, receives change
  // If not provided, default to cardanoAddress (backward compat for "My Wallet" flows)
  const ownAddr = cardanoOwnAddress || cardanoAddress;

  // Fast path: if we already have a proven tx cbor from a previous attempt, skip prover
  let proverResponseHex = claimTxCborHex;

  if (!proverResponseHex) {
  // Fetch BTC finality proof
  onStatus?.('Fetching Bitcoin finality proof...');
  const btcProofData = await fetchBtcTxWithProof(btcTxid, network);

  // Prepare collateral + funding — auto-consolidate or auto-split as needed.
  onStatus?.('Checking Cardano funding...');
  const placeholderUtxoIdStr = `${placeholderTxid}:${placeholderVout}`;
  const { collateralUtxoId, fundingUtxoId } = await prepareCollateralAndFunding({
    address: ownAddr,
    seedPhrase,
    addressIndex,
    excludeUtxoIds: [placeholderUtxoIdStr],
    network,
    onStatus,
    consolidateWaitMs: 5000,
  });

  // Build claim spell with 2 inputs: placeholder + funding
  onStatus?.('Building claim spell...');
  const placeholderUtxoId = `${placeholderTxid}:${placeholderVout}`;
  const { spell, beamedFrom } = buildClaimSpell({
    tokenAppId, placeholderUtxoId,
    btcBeamTxid: btcTxid, btcBeamVout: 0,
    claimAmount: beamAmount, cardanoAddress,
    fundingUtxoId,
  });

  // Normalize
  const { normalizedSpellHex, appPrivateInputs, txInsBeamedSourceUtxos } =
    await normalizeClaimSpell(spell, beamedFrom);

  // Fetch prev tx CBORs
  onStatus?.('Fetching previous transactions...');
  const { getCardanoTxCbor } = await import('@/services/cardano/api');
  const placeholderCbor = await getCardanoTxCbor(placeholderTxid);

  const fundingTxHash = fundingUtxoId.split(':')[0];
  const fundingCbor = fundingTxHash === placeholderTxid
    ? placeholderCbor
    : await getCardanoTxCbor(fundingTxHash);

  const claimPrevTxs = [{ cardano: placeholderCbor }];
  if (fundingTxHash !== placeholderTxid) {
    claimPrevTxs.push({ cardano: fundingCbor });
  }
  claimPrevTxs.push({
    bitcoin: { tx: btcProofData.txHex, proof: btcProofData.proofHex, headers: btcProofData.headers },
  });

  // No WASM binary needed — beaming is a simple transfer
  const claimPayload = buildClaimPayload({
    normalizedSpellHex, appPrivateInputs, txInsBeamedSourceUtxos,
    binaries: {},
    prevTxs: claimPrevTxs, changeAddress: ownAddr,
    feeRate: 0, collateralUtxo: collateralUtxoId,
  });

  onStatus?.('Proving Cardano claim (5-10 min)...');
  proverResponseHex = await submitClaimToProver(claimPayload, network, onStatus);

  // Persist the proven tx cbor so a failed broadcast doesn't require re-proving
  if (onProved) await onProved(proverResponseHex);
  } // end !proverResponseHex block

  // The prover returns Scrolls-signed tx. We need to add our own signature.
  onStatus?.('Signing Cardano transaction...');
  const { waitForCardanoWasm, getCardanoWasm } = await import('@/lib/cardano/cardanoWasm');
  await waitForCardanoWasm();
  const CSL = getCardanoWasm();
  const bip39 = await import('bip39');

  const rootKey = CSL.Bip32PrivateKey.from_bip39_entropy(
    Buffer.from(bip39.mnemonicToEntropy(seedPhrase), 'hex'),
    Buffer.alloc(0)
  );
  const paymentKey = rootKey.derive(2147485500).derive(2147485463).derive(2147483648).derive(0).derive(addressIndex);

  // Parse prover response — may be JSON with cborHex or raw hex
  let txCborHex = proverResponseHex;
  try {
    const parsed = JSON.parse(proverResponseHex);
    if (parsed.cborHex) txCborHex = parsed.cborHex;
  } catch { /* raw hex */ }

  const fixedTx = CSL.FixedTransaction.from_bytes(Buffer.from(txCborHex, 'hex'));
  fixedTx.sign_and_add_vkey_signature(paymentKey.to_raw_key());

  const signedBytes = fixedTx.to_bytes();

  // Submit signed tx to Cardano
  onStatus?.('Broadcasting Cardano claim...');
  const { submitCardanoTx } = await import('@/services/cardano/api');
  const adaClaimTxid = await submitCardanoTx(signedBytes);

  // Reserve placeholder + funding + collateral so concurrent ops skip them
  try {
    const { useCardano } = await import('@/stores/cardanoStore');
    useCardano.getState().updateAfterTransaction([
      { utxoId: placeholderUtxoIdStr },
      { utxoId: fundingUtxoId },
      { utxoId: collateralUtxoId },
    ]);
  } catch (e) { console.warn('[Step6Claim] mark spent failed:', e?.message); }

  return {
    adaClaimTxid: typeof adaClaimTxid === 'string'
      ? adaClaimTxid.replace(/"/g, '').trim()
      : fixedTx.transaction_hash().to_hex(),
  };
}
