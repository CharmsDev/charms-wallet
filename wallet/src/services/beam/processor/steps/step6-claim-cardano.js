/**
 * Step 6: Claim beamed tokens on Cardano via the prover.
 *
 * The prover generates ZK proof, builds Cardano tx, and calls Scrolls for signature.
 * We then add our own signature and submit to Cardano.
 *
 * Input:  tokenAppId, placeholderTxHash, placeholderOutputIndex, btcTxid, beamAmount,
 *         cardanoAddress, seedPhrase, network
 * Output: { adaClaimTxid }
 */

import { fetchBtcTxWithProof } from '../../chains/bitcoin/proof';
import { selectCardanoCollateral, selectCardanoFunding, checkCardanoBeamReadiness, consolidateAdaUtxos } from '../../chains/cardano/funding';
import { buildClaimSpell } from '../../spells/claim-builder';
import { normalizeClaimSpell } from '../../spells/claim-normalizer';
import { buildClaimPayload, submitClaimToProver } from '../../spells/claim-payload';

export async function claimOnCardano({
  tokenAppId, placeholderTxHash, placeholderOutputIndex,
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

  // Check Cardano readiness — auto-consolidate if fragmented
  onStatus?.('Checking Cardano funding...');
  const placeholderUtxoIdStr = `${placeholderTxHash}:${placeholderOutputIndex}`;
  let readiness = await checkCardanoBeamReadiness(ownAddr);

  if (!readiness.ok && readiness.needsConsolidation) {
    onStatus?.('Consolidating ADA UTXOs (one-time setup)...');
    const consolidation = await consolidateAdaUtxos({
      address: ownAddr,
      seedPhrase,
      addressIndex,
      excludeUtxoIds: [placeholderUtxoIdStr],
      onStatus,
    });
    onStatus?.(`Consolidation tx: ${consolidation.txHash.slice(0, 16)}... waiting for confirmation`);
    await new Promise(r => setTimeout(r, 5000));
    readiness = await checkCardanoBeamReadiness(ownAddr);
  }

  if (!readiness.ok) {
    throw new Error(readiness.message || 'Cardano not ready for beam claim');
  }

  // Select collateral and funding from OUR address
  onStatus?.('Selecting Cardano collateral and funding...');
  const collateral = await selectCardanoCollateral(ownAddr, [placeholderUtxoIdStr]);
  const fundingUtxo = await selectCardanoFunding(ownAddr, [placeholderUtxoIdStr, collateral.utxoId]);

  if (!fundingUtxo) {
    throw new Error('No suitable Cardano funding UTXO. Send more ADA or wait for consolidation to confirm.');
  }
  const collateralUtxoId = collateral.utxoId;
  const fundingUtxoId = fundingUtxo.utxoId;

  // Build claim spell with 2 inputs: placeholder + funding
  onStatus?.('Building claim spell...');
  const placeholderUtxoId = `${placeholderTxHash}:${placeholderOutputIndex}`;
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
  const placeholderCbor = await getCardanoTxCbor(placeholderTxHash);

  // Funding tx CBOR (may be same tx as placeholder)
  let fundingCbor;
  if (fundingUtxo.txHash === placeholderTxHash) {
    fundingCbor = placeholderCbor;
  } else {
    fundingCbor = await getCardanoTxCbor(fundingUtxo.txHash);
  }

  // Prev txs: Cardano placeholder + Cardano funding + BTC beam with finality proof
  const claimPrevTxs = [
    { cardano: placeholderCbor },
  ];
  if (fundingUtxo.txHash !== placeholderTxHash) {
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
