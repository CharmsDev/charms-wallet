/**
 * Beam-Back Executor — Linear orchestrator for ADA→BTC beam.
 *
 * 5 steps:
 *   1. Cardano beam-out (prove + Scrolls sign + our sign + broadcast)
 *   2. Get Cardano finality certificate (Scrolls certify_final via Mithril)
 *   3. Bitcoin claim (prove + sign + broadcast)
 *
 * No placeholder creation needed — uses an existing BTC UTXO as placeholder.
 * No Bitcoin finality wait — Cardano finality is instant (Scrolls signature).
 * But Mithril certification may take 20-60 minutes.
 *
 * Saves checkpoint after every step for resume.
 */

import { BEAM_PHASE } from '../core/types';
import { saveBeamState } from '../core/persistence';
import { getProverUrl } from '@/services/charm-transfer/constants';

export async function executeBeamBack(params) {
  const { beamId, onPhase, signal } = params;
  const ctx = { ...params };
  const save = (phase) => saveBeamState(beamId, { phase, direction: 'ada-to-btc', ...snapshot(ctx) });

  // Step 1: Prove + sign + broadcast Cardano beam-out (skip if already broadcast)
  if (!ctx.cardanoBeamOutTxHash) {
    onPhase(BEAM_PHASE.BUILDING_SPELL, 'Building Cardano beam-out spell...');
    const { cardanoBeamOutTxHash, cardanoTxCborHex } = await proveAndBroadcastCardanoBeamOut({
      ...ctx,
      onStatus: m => onPhase(BEAM_PHASE.PROVING, m),
    });
    ctx.cardanoBeamOutTxHash = cardanoBeamOutTxHash;
    ctx.cardanoTxCborHex = cardanoTxCborHex;
    save(BEAM_PHASE.WAITING_FINALITY);
  }

  // Step 2: Get Cardano finality certificate (skip if already have it)
  if (!ctx.finalitySignature) {
    onPhase(BEAM_PHASE.WAITING_FINALITY, 'Waiting for Cardano finality (Mithril)...');
    const { finalitySignature } = await waitForCardanoFinality({
      cardanoTxCborHex: ctx.cardanoTxCborHex,
      onStatus: m => onPhase(BEAM_PHASE.WAITING_FINALITY, m),
      signal,
    });
    ctx.finalitySignature = finalitySignature;
    save(BEAM_PHASE.CLAIMING_DEST);
  }

  // Step 3: Prove + sign + broadcast Bitcoin claim (skip if already claimed)
  if (!ctx.btcClaimTxid) {
    onPhase(BEAM_PHASE.CLAIMING_DEST, 'Proving Bitcoin claim...');
    const { btcClaimTxid } = await proveAndBroadcastBtcClaim({
      ...ctx,
      onStatus: m => onPhase(BEAM_PHASE.CLAIMING_DEST, m),
    });
    ctx.btcClaimTxid = btcClaimTxid;
    save(BEAM_PHASE.COMPLETE);
  }

  onPhase(BEAM_PHASE.COMPLETE, 'Beam back complete!');
  return { cardanoBeamOutTxHash: ctx.cardanoBeamOutTxHash, btcClaimTxid: ctx.btcClaimTxid };
}

// ── Step 1: Cardano Beam-Out ────────────────────────────────────────────────

async function proveAndBroadcastCardanoBeamOut({
  tokenAppId, cntUtxoId, fundingUtxoId, beamAmount, changeAmount,
  btcPlaceholderUtxoId, beamToHash, cardanoAddress, collateralUtxoId,
  seedPhrase, addressIndex = 0, network, onStatus,
}) {
  const { SPELL_VERSION } = await import('@/services/charm-transfer/constants');
  const { selectCardanoCollateral, selectCardanoFunding, checkCardanoBeamReadiness, consolidateAdaUtxos } =
    await import('../chains/cardano/funding');

  // Auto-select funding & collateral if not provided, with auto-consolidation
  if (!fundingUtxoId || !collateralUtxoId) {
    onStatus?.('Checking Cardano funding...');
    let readiness = await checkCardanoBeamReadiness(cardanoAddress);

    if (!readiness.ok && readiness.needsConsolidation) {
      onStatus?.('Consolidating ADA UTXOs (one-time setup)...');
      const consolidation = await consolidateAdaUtxos({
        address: cardanoAddress,
        seedPhrase,
        addressIndex,
        excludeUtxoIds: [cntUtxoId],
        onStatus,
      });
      onStatus?.(`Consolidation tx ${consolidation.txHash.slice(0, 16)}... waiting...`);
      await new Promise(r => setTimeout(r, 8000));
      readiness = await checkCardanoBeamReadiness(cardanoAddress);
    }

    if (!readiness.ok) throw new Error(readiness.message || 'Cardano not ready for beam');

    onStatus?.('Selecting Cardano collateral and funding...');
    const collateral = await selectCardanoCollateral(cardanoAddress, [cntUtxoId]);
    const funding = await selectCardanoFunding(cardanoAddress, [cntUtxoId, collateral.utxoId]);
    if (!funding) throw new Error('No suitable Cardano funding UTXO');

    collateralUtxoId = collateral.utxoId;
    fundingUtxoId = funding.utxoId;
  }

  onStatus?.('Building Cardano beam-out spell...');
  const { normalizeCardanoBeamOutSpell } = await import('../spells/beam-back-normalizer');
  const { normalizedSpellHex, appPrivateInputs } = await normalizeCardanoBeamOutSpell({
    tokenAppId, cntUtxoId, fundingUtxoId,
    beamAmount, changeAmount, beamToHash, cardanoAddress,
  });

  // Fetch prev tx CBORs
  onStatus?.('Fetching previous transactions...');
  const { getCardanoTxCbor } = await import('@/services/cardano/api');
  const cntTxHash = cntUtxoId.split(':')[0];
  const fundingTxHash = fundingUtxoId.split(':')[0];
  const cntCbor = await getCardanoTxCbor(cntTxHash);
  const fundingCbor = cntTxHash === fundingTxHash ? cntCbor : await getCardanoTxCbor(fundingTxHash);

  // Build prover payload
  const prevTxs = [{ cardano: cntCbor }];
  if (cntTxHash !== fundingTxHash) prevTxs.push({ cardano: fundingCbor });

  const payload = {
    spell: normalizedSpellHex,
    app_private_inputs: appPrivateInputs,
    tx_ins_beamed_source_utxos: {},
    binaries: {},
    prev_txs: prevTxs,
    change_address: cardanoAddress,
    fee_rate: 0,
    chain: 'cardano',
    collateral_utxo: collateralUtxoId,
  };

  // Submit to prover
  onStatus?.('Proving Cardano beam-out (5-10 min)...');
  const proverUrl = getProverUrl(network);
  const resp = await fetch(proverUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Prover failed: ${errText}`);
  }

  let cardanoTxCborHex = await resp.text();
  try {
    const parsed = JSON.parse(cardanoTxCborHex);
    if (parsed.cborHex) cardanoTxCborHex = parsed.cborHex;
  } catch { /* raw hex */ }

  // Sign with our Cardano key
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

  const fixedTx = CSL.FixedTransaction.from_bytes(Buffer.from(cardanoTxCborHex, 'hex'));
  fixedTx.sign_and_add_vkey_signature(paymentKey.to_raw_key());
  const signedBytes = fixedTx.to_bytes();

  // Submit to Cardano
  onStatus?.('Broadcasting Cardano beam-out...');
  const { submitCardanoTx } = await import('@/services/cardano/api');
  const adaResult = await submitCardanoTx(signedBytes);
  const cardanoBeamOutTxHash = typeof adaResult === 'string'
    ? adaResult.replace(/"/g, '').trim()
    : fixedTx.transaction_hash().to_hex();

  // Mark spent UTXOs as reserved (CNT + funding + collateral) so concurrent
  // operations don't try to re-select them before next refresh.
  try {
    const { useCardano } = await import('@/stores/cardanoStore');
    useCardano.getState().updateAfterTransaction([
      { utxoId: cntUtxoId },
      { utxoId: fundingUtxoId },
      { utxoId: collateralUtxoId },
    ]);
  } catch (e) { console.warn('[BeamBack] mark spent failed:', e?.message); }

  return { cardanoBeamOutTxHash, cardanoTxCborHex };
}

// ── Step 2: Cardano Finality Certificate ────────────────────────────────────

async function waitForCardanoFinality({ cardanoTxCborHex, onStatus, signal }) {
  // Poll Scrolls certify_final via direct ICP canister call
  const { certifyFinal } = await import('@/services/scrolls/scrolls-cardano');
  const maxAttempts = 24; // 24 * 5 min = 2 hours max
  const pollInterval = 5 * 60 * 1000; // 5 minutes

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) throw new Error('Beam cancelled');

    onStatus?.(`Waiting for Mithril certification (attempt ${attempt}/${maxAttempts})...`);

    try {
      const signature = await certifyFinal(cardanoTxCborHex);
      onStatus?.('Finality certificate obtained!');
      return { finalitySignature: signature };
    } catch (err) {
      // "There's no certified transaction to verify" = Mithril not ready yet
      if (!err.message?.includes('no certified transaction')) {
        console.warn('[BeamBack] certify_final error:', err.message);
      }
    }

    if (attempt < maxAttempts) {
      await new Promise(r => setTimeout(r, pollInterval));
    }
  }

  throw new Error('Mithril finality certification timed out after 2 hours');
}

// ── Step 3: Bitcoin Claim ───────────────────────────────────────────────────

async function proveAndBroadcastBtcClaim({
  tokenAppId, btcPlaceholderUtxoId, btcFundingUtxoId, beamAmount,
  cardanoBeamOutTxHash, cardanoTxCborHex, finalitySignature,
  btcChangeAddress, seedPhrase, network, onStatus,
}) {
  const { getMempoolBase } = await import('@/services/charm-transfer/constants');

  const [placeholderTxid] = btcPlaceholderUtxoId.split(':');
  const [fundingTxid] = btcFundingUtxoId.split(':');

  // Build + normalize BTC claim spell (proper CBOR)
  onStatus?.('Building BTC claim spell...');
  const { normalizeBtcClaimSpell } = await import('../spells/beam-back-normalizer');
  const { normalizedSpellHex, appPrivateInputs, txInsBeamedSourceUtxos } = await normalizeBtcClaimSpell({
    tokenAppId,
    btcPlaceholderUtxoId,
    btcFundingUtxoId,
    beamAmount,
    cardanoBeamOutTxid: `${cardanoBeamOutTxHash}:0`,
    btcDestAddress: btcChangeAddress,
  });

  // Fetch prev txs
  onStatus?.('Fetching Bitcoin transactions...');
  const mempoolBase = getMempoolBase(network);
  const [placeholderTxHex, fundingTxHex] = await Promise.all([
    fetch(`${mempoolBase}/tx/${placeholderTxid}/hex`).then(r => r.text()),
    placeholderTxid === fundingTxid
      ? Promise.resolve(null)
      : fetch(`${mempoolBase}/tx/${fundingTxid}/hex`).then(r => r.text()),
  ]);

  // Cardano prev_tx with finality signature
  const cardanoPrevTx = { cardano: { tx: cardanoTxCborHex, signature: finalitySignature } };

  const prevTxs = [{ bitcoin: placeholderTxHex }];
  if (fundingTxHex) prevTxs.push({ bitcoin: fundingTxHex });
  prevTxs.push(cardanoPrevTx);

  const payload = {
    spell: normalizedSpellHex,
    app_private_inputs: appPrivateInputs,
    tx_ins_beamed_source_utxos: txInsBeamedSourceUtxos,
    binaries: {},
    prev_txs: prevTxs,
    change_address: btcChangeAddress,
    fee_rate: 2,
    chain: 'bitcoin',
    collateral_utxo: null,
  };

  onStatus?.('Proving Bitcoin claim (5-10 min)...');
  const proverUrl = getProverUrl(network);
  const resp = await fetch(proverUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) throw new Error(`Prover failed: ${await resp.text()}`);
  const result = await resp.json();
  const unsignedTxHex = Array.isArray(result) ? result[0]?.bitcoin : result?.bitcoin;

  // Sign with our BTC key
  onStatus?.('Signing Bitcoin transaction...');
  const { signSpellTx } = await import('@/services/charm-transfer/tx-signer');
  const signedTxHex = await signSpellTx(unsignedTxHex, seedPhrase, network);

  // Broadcast
  onStatus?.('Broadcasting Bitcoin claim...');
  const broadcastResp = await fetch(`${mempoolBase}/tx`, {
    method: 'POST',
    body: signedTxHex,
  });

  if (!broadcastResp.ok) throw new Error(`Broadcast failed: ${await broadcastResp.text()}`);
  const btcClaimTxid = (await broadcastResp.text()).trim();

  return { btcClaimTxid };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function snapshot(ctx) {
  return {
    direction: 'ada-to-btc',
    tokenAppId: ctx.tokenAppId,
    beamAmount: ctx.beamAmount,
    cardanoAddress: ctx.cardanoAddress,
    btcChangeAddress: ctx.btcChangeAddress,
    btcNetwork: ctx.network,
    cntUtxoId: ctx.cntUtxoId,
    btcPlaceholderUtxoId: ctx.btcPlaceholderUtxoId,
    cardanoBeamOutTxHash: ctx.cardanoBeamOutTxHash,
    finalitySignature: ctx.finalitySignature,
    btcClaimTxid: ctx.btcClaimTxid,
  };
}
