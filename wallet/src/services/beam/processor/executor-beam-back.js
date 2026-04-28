/**
 * Beam-Back Executor — Linear orchestrator for ADA→BTC beam.
 *
 * Protocol flow (5 stages):
 *   1. Create BTC placeholder (dust UTXO at our own BTC address; the beam_to
 *      hash is SHA256 of its utxo_id, so only we can claim on BTC)
 *   2. Wait for placeholder to appear in the BTC mempool
 *   3. Cardano beam-out (prove + Scrolls sign + our sign + broadcast)
 *   4. Wait for Cardano finality certificate (Scrolls certify_final via Mithril)
 *   5. Bitcoin claim (prove + sign + broadcast)
 *
 * Cardano finality uses Mithril (may take 20-60 minutes) — different from
 * BTC→ADA direction which waits for 6 block confirmations.
 *
 * Saves checkpoint after every stage for resume.
 */

import { BEAM_PHASE } from '../core/types';
import { saveBeamState } from '../core/persistence';
import { getProverUrl } from '@/services/charm-transfer/constants';
import { createBtcPlaceholder, waitForBtcInMempool } from '../chains/bitcoin/placeholder';
import { utxoIdHash } from '../core/crypto';
import { dumpBeamPayload } from '../core/debug-dump';

export async function executeBeamBack(params) {
  const { beamId, onPhase, onCheckpoint, signal } = params;
  const ctx = { ...params };
  const save = (phase) => saveBeamState(beamId, { phase, direction: 'ada-to-btc', ...snapshot(ctx) });

  // Stage 1: Create BTC placeholder (skip if already created).
  // Placeholder lives at OUR OWN BTC address — it's the claim ticket only we can spend.
  if (!ctx.placeholderUtxoId) {
    onPhase(BEAM_PHASE.CREATING_PLACEHOLDER, 'Creating Bitcoin placeholder...');
    const ph = await createBtcPlaceholder({
      btcAddress: ctx.btcOwnAddress || ctx.btcDestAddress,
      seedPhrase: ctx.seedPhrase,
      network: ctx.network,
      onStatus: m => onPhase(BEAM_PHASE.CREATING_PLACEHOLDER, m),
    });
    ctx.placeholderUtxoId = ph.utxo;
    ctx.placeholderTxid = ph.txid;
    ctx.placeholderVout = ph.vout;
    onCheckpoint?.({ placeholderTxid: ph.txid, placeholderVout: ph.vout, placeholderUtxoId: ph.utxo });
    save(BEAM_PHASE.WAITING_DEST_CONFIRM);
  }

  // Stage 2: Wait for placeholder in mempool, then compute beam_to hash.
  if (!ctx.beamToHash) {
    onPhase(BEAM_PHASE.WAITING_DEST_CONFIRM, 'Waiting for placeholder in mempool...');
    await waitForBtcInMempool(ctx.placeholderTxid, ctx.network, signal);
    ctx.beamToHash = await utxoIdHash(ctx.placeholderTxid, ctx.placeholderVout);
    save(BEAM_PHASE.BUILDING_SPELL);
  }

  // Stage 3: Prove + sign + broadcast Cardano beam-out (skip if already broadcast)
  if (!ctx.cardanoBeamOutTxHash) {
    onPhase(BEAM_PHASE.BUILDING_SPELL, 'Building Cardano beam-out spell...');
    const { cardanoBeamOutTxHash, cardanoTxCborHex } = await proveAndBroadcastCardanoBeamOut({
      ...ctx,
      onStatus: m => onPhase(BEAM_PHASE.PROVING, m),
    });
    ctx.cardanoBeamOutTxHash = cardanoBeamOutTxHash;
    ctx.cardanoTxCborHex = cardanoTxCborHex;
    onCheckpoint?.({ cardanoBeamOutTxHash });
    save(BEAM_PHASE.WAITING_FINALITY);
  }

  // Stage 4: Get Cardano finality certificate (skip if already have it)
  if (!ctx.finalitySignature) {
    // Self-heal: older saves may have only the txid; rehydrate the CBOR
    // from chain so Mithril can verify it.
    if (!ctx.cardanoTxCborHex && ctx.cardanoBeamOutTxHash) {
      const { getCardanoTxCbor } = await import('@/services/cardano/api');
      const cardanoNet = ctx.network === 'mainnet' ? 'mainnet' : 'preprod';
      ctx.cardanoTxCborHex = await getCardanoTxCbor(ctx.cardanoBeamOutTxHash, cardanoNet);
    }
    onPhase(BEAM_PHASE.WAITING_FINALITY, 'Waiting for Cardano finality (Mithril)...');
    const { finalitySignature } = await waitForCardanoFinality({
      cardanoTxCborHex: ctx.cardanoTxCborHex,
      onStatus: m => onPhase(BEAM_PHASE.WAITING_FINALITY, m),
      signal,
    });
    ctx.finalitySignature = finalitySignature;
    save(BEAM_PHASE.CLAIMING_DEST);
  }

  // Stage 5: Prove + sign + broadcast Bitcoin claim (skip if already claimed)
  if (!ctx.btcClaimTxid) {
    onPhase(BEAM_PHASE.CLAIMING_DEST, 'Proving Bitcoin claim...');
    const { btcClaimTxid } = await proveAndBroadcastBtcClaim({
      ...ctx,
      onStatus: m => onPhase(BEAM_PHASE.CLAIMING_DEST, m),
    });
    ctx.btcClaimTxid = btcClaimTxid;
    onCheckpoint?.({ btcClaimTxid });
    save(BEAM_PHASE.COMPLETE);
  }

  onPhase(BEAM_PHASE.COMPLETE, 'Beam back complete!');
  return {
    placeholderTxid: ctx.placeholderTxid,
    cardanoBeamOutTxHash: ctx.cardanoBeamOutTxHash,
    btcClaimTxid: ctx.btcClaimTxid,
  };
}

// ── Step 1: Cardano Beam-Out ────────────────────────────────────────────────

async function proveAndBroadcastCardanoBeamOut({
  tokenAppId, assetUnit, cntUtxoId, fundingUtxoId, beamAmount,
  placeholderUtxoId, beamToHash, cardanoAddress, collateralUtxoId,
  seedPhrase, addressIndex = 0, network, onStatus,
}) {
  const { prepareCollateralAndFunding } = await import('../chains/cardano/funding');

  // Legacy fallback: ops persisted before multi-input refactor only saved
  // `cntUtxoId`. Derive `assetUnit` from that UTXO's assets so resume works.
  if (!assetUnit) {
    if (!cntUtxoId) throw new Error('Beam-back requires assetUnit (or legacy cntUtxoId)');
    const { fetchUtxos } = await import('@/services/cardano/api');
    const cardanoNet = network === 'mainnet' ? 'mainnet' : 'preprod';
    const utxos = await fetchUtxos(cardanoAddress, cardanoNet);
    const [cntTxH, cntIdxStr] = cntUtxoId.split(':');
    const cntU = utxos.find(u => u.txHash === cntTxH && u.outputIndex === parseInt(cntIdxStr, 10));
    assetUnit = cntU?.assets?.find(a => a.unit && a.quantity)?.unit;
    if (!assetUnit) throw new Error(`Cannot derive assetUnit from legacy cntUtxoId ${cntUtxoId}`);
  }

  // Pick CNT inputs that cover the beam amount (largest-first accumulator).
  // Token math MUST balance: sum(input_amounts) == beam + change. A single
  // UTXO breaks the spell when the user's CNT is fragmented.
  onStatus?.('Selecting CNT UTXOs...');
  const { selectCntUtxos } = await import('../chains/cardano/cnt-selector');
  const beam = BigInt(beamAmount);
  const { inputs: cntInputs, totalAmount: cntTotal } =
    await selectCntUtxos(cardanoAddress, assetUnit, beam, network);
  const change = cntTotal - beam;
  console.log('[BeamBack:ada-out] CNT inputs:', cntInputs.length,
    'total:', cntTotal.toString(), 'beam:', beam.toString(), 'change:', change.toString());

  // Auto-select funding & collateral if not provided, with auto-consolidation
  if (!fundingUtxoId || !collateralUtxoId) {
    onStatus?.('Checking Cardano funding...');
    const prepared = await prepareCollateralAndFunding({
      address: cardanoAddress,
      seedPhrase,
      addressIndex,
      excludeUtxoIds: cntInputs.map(i => i.utxoId),
      network,
      onStatus,
    });
    collateralUtxoId = prepared.collateralUtxoId;
    fundingUtxoId = prepared.fundingUtxoId;
  }

  onStatus?.('Building Cardano beam-out spell...');
  const { normalizeCardanoBeamOutSpell } = await import('../spells/beam-back-normalizer');
  const { normalizedSpellHex, appPrivateInputs } = await normalizeCardanoBeamOutSpell({
    tokenAppId, cntInputs, fundingUtxoId,
    beamAmount: Number(beam), changeAmount: Number(change), beamToHash, cardanoAddress,
  });

  // Fetch prev tx CBORs (1:1 with spell.ins, dedupe via cache).
  onStatus?.('Fetching previous transactions...');
  const { getCardanoTxCbor } = await import('@/services/cardano/api');
  const cardanoNet = network === 'mainnet' ? 'mainnet' : 'preprod';
  const cborCache = new Map();
  const getCbor = async (txHash) => {
    if (!cborCache.has(txHash)) cborCache.set(txHash, getCardanoTxCbor(txHash, cardanoNet));
    return cborCache.get(txHash);
  };
  const fundingTxHash = fundingUtxoId.split(':')[0];
  const prevTxs = await Promise.all([
    ...cntInputs.map(async i => ({ cardano: await getCbor(i.txHash) })),
    (async () => ({ cardano: await getCbor(fundingTxHash) }))(),
  ]);

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

  // Uncomment to dump spell + payload to _rjj/tmp for offline inspection.
  // dumpBeamPayload('beam-back-ada', {
  //   tokenAppId, cntUtxoId, fundingUtxoId, beamAmount, changeAmount,
  //   beamToHash, cardanoAddress, collateralUtxoId,
  // }, payload);

  // Submit to prover
  onStatus?.('Proving Cardano beam-out (5-10 min)...');
  const proverUrl = getProverUrl(network);
  const t0 = Date.now();
  const resp = await fetch(proverUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  console.log(`[BeamBack:ada-out] prover response: ${resp.status} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Prover failed: ${errText}`);
  }

  const raw = await resp.text();

  // v14 prover returns JSON like [{ "cardano": "<cbor hex>" }] or { cardano: ... }.
  // Legacy formats also supported: { cborHex: ... } or raw hex string.
  let cardanoTxCborHex = raw;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed[0]?.cardano) cardanoTxCborHex = parsed[0].cardano;
    else if (parsed.cardano) cardanoTxCborHex = parsed.cardano;
    else if (parsed.cborHex) cardanoTxCborHex = parsed.cborHex;
    else if (typeof parsed === 'string') cardanoTxCborHex = parsed;
  } catch { /* raw hex */ }

  if (!cardanoTxCborHex || cardanoTxCborHex.length < 100) {
    throw new Error(`Prover returned empty or too-short response: "${raw.slice(0, 200)}"`);
  }
  if (!/^[0-9a-fA-F]+$/.test(cardanoTxCborHex)) {
    throw new Error(`Prover response is not valid hex: "${cardanoTxCborHex.slice(0, 200)}"`);
  }

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

  // Submit to Cardano (explicit network).
  onStatus?.('Broadcasting Cardano beam-out...');
  const { submitCardanoTx } = await import('@/services/cardano/api');
  const adaResult = await submitCardanoTx(signedBytes, cardanoNet);
  const cardanoBeamOutTxHash = typeof adaResult === 'string'
    ? adaResult.replace(/"/g, '').trim()
    : fixedTx.transaction_hash().to_hex();

  // Mark spent UTXOs as reserved (CNTs + funding + collateral) so concurrent
  // operations don't try to re-select them before next refresh.
  try {
    const { useCardano } = await import('@/stores/cardanoStore');
    useCardano.getState().updateAfterTransaction([
      ...cntInputs.map(i => ({ utxoId: i.utxoId })),
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
  tokenAppId, placeholderUtxoId, btcFundingUtxoId, beamAmount,
  cardanoBeamOutTxHash, cardanoTxCborHex, finalitySignature,
  btcOwnAddress, btcDestAddress, seedPhrase, network, onStatus,
}) {
  const { getMempoolBase } = await import('@/services/charm-transfer/constants');
  const mempoolBase = getMempoolBase(network);

  // Auto-select funding UTXO (≥ 5000 sats, non-placeholder) if not provided.
  if (!btcFundingUtxoId) {
    onStatus?.('Selecting BTC funding UTXO...');
    const fundAddr = btcOwnAddress || btcDestAddress;
    const utxos = await fetch(`${mempoolBase}/address/${fundAddr}/utxo`).then(r => r.json());
    const funding = utxos
      .filter(u => u.value >= 5000)
      .filter(u => `${u.txid}:${u.vout}` !== placeholderUtxoId)
      .sort((a, b) => b.value - a.value)[0];
    if (!funding) throw new Error('No BTC funding UTXO ≥ 5000 sats for claim fees');
    btcFundingUtxoId = `${funding.txid}:${funding.vout}`;
  }

  const [placeholderTxid] = placeholderUtxoId.split(':');
  const [fundingTxid] = btcFundingUtxoId.split(':');

  // Build + normalize BTC claim spell (proper CBOR)
  onStatus?.('Building BTC claim spell...');
  const { normalizeBtcClaimSpell } = await import('../spells/beam-back-normalizer');
  const { normalizedSpellHex, appPrivateInputs, txInsBeamedSourceUtxos } = await normalizeBtcClaimSpell({
    tokenAppId,
    placeholderUtxoId,
    btcFundingUtxoId,
    beamAmount,
    cardanoBeamOutTxid: `${cardanoBeamOutTxHash}:0`,
    btcDestAddress,
  });

  // Fetch prev txs
  onStatus?.('Fetching Bitcoin transactions...');
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

  // change_address: any leftover sats from funding UTXO (minus fees) go here.
  // Default to our own address so external destination only receives the
  // 546-sat charm output, not the user's change.
  // Dynamic fee rate (current-block target + 10% margin). Hardcoded 2 sat/vB
  // was unsafe under any mempool pressure.
  const { fetchFeeRate } = await import('../chains/bitcoin/fee');
  const feeRate = await fetchFeeRate(network);

  const payload = {
    spell: normalizedSpellHex,
    app_private_inputs: appPrivateInputs,
    tx_ins_beamed_source_utxos: txInsBeamedSourceUtxos,
    binaries: {},
    prev_txs: prevTxs,
    change_address: btcOwnAddress || btcDestAddress,
    fee_rate: feeRate,
    chain: 'bitcoin',
    collateral_utxo: null,
  };

  // Uncomment to dump spell + payload to _rjj/tmp for offline inspection.
  // dumpBeamPayload('beam-back-btc', {
  //   tokenAppId, placeholderUtxoId, btcFundingUtxoId, beamAmount,
  //   cardanoBeamOutTxHash, btcOwnAddress, btcDestAddress,
  // }, payload);

  onStatus?.('Proving Bitcoin claim (5-10 min)...');
  const proverUrl = getProverUrl(network);
  const t0 = Date.now();
  const resp = await fetch(proverUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  console.log(`[BeamBack:btc-claim] prover response: ${resp.status} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  if (!resp.ok) throw new Error(`Prover failed: ${await resp.text()}`);

  const raw = await resp.text();

  // v14 prover returns [{"bitcoin": "<hex>"}] for a BTC claim.
  let result;
  try { result = JSON.parse(raw); } catch {
    throw new Error(`Prover response is not JSON: "${raw.slice(0, 200)}"`);
  }
  const unsignedTxHex = Array.isArray(result) ? result[0]?.bitcoin : result?.bitcoin;
  if (!unsignedTxHex || !/^[0-9a-fA-F]+$/.test(unsignedTxHex)) {
    throw new Error(`Prover returned invalid BTC tx hex: "${raw.slice(0, 200)}"`);
  }

  // Sign with our BTC key (same multi-key signer used by the eBTC mint path).
  // Both placeholder and funding UTXOs live at btcOwnAddress (index 0, non-change),
  // so we map both to that key. Prover-added inputs the map doesn't cover will
  // be left unsigned — harmless for our wallet's inputs but relies on the
  // prover not adding foreign inputs (which it doesn't for BTC claims).
  onStatus?.('Signing Bitcoin transaction...');
  const { signSpellTxMultiKey } = await import('@/services/charm-transfer/tx-signer');
  const { fetchTxHex } = await import('@/services/charm-transfer/tx-fetcher');
  const bitcoin = await import('bitcoinjs-lib');

  const unsignedTx = bitcoin.Transaction.fromHex(unsignedTxHex);
  const prevTxMap = new Map();
  prevTxMap.set(placeholderTxid, placeholderTxHex);
  if (fundingTxHex) prevTxMap.set(fundingTxid, fundingTxHex);
  // Fetch any prover-added prev txs we don't already have cached
  for (const inp of unsignedTx.ins) {
    const txid = Buffer.from(inp.hash).reverse().toString('hex');
    if (!prevTxMap.has(txid)) {
      prevTxMap.set(txid, await fetchTxHex(txid, network));
    }
  }

  const ownAddr = btcOwnAddress || btcDestAddress;
  const inputSigningMap = {
    [placeholderUtxoId]: { index: 0, isChange: false, address: ownAddr },
    [btcFundingUtxoId]: { index: 0, isChange: false, address: ownAddr },
  };

  const signedTxHex = await signSpellTxMultiKey(unsignedTxHex, prevTxMap, inputSigningMap, seedPhrase, network);

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
    btcOwnAddress: ctx.btcOwnAddress,
    btcDestAddress: ctx.btcDestAddress,
    btcNetwork: ctx.network,
    assetUnit: ctx.assetUnit,
    cntUtxoId: ctx.cntUtxoId,
    placeholderUtxoId: ctx.placeholderUtxoId,
    placeholderTxid: ctx.placeholderTxid,
    placeholderVout: ctx.placeholderVout,
    beamToHash: ctx.beamToHash,
    cardanoBeamOutTxHash: ctx.cardanoBeamOutTxHash,
    cardanoTxCborHex: ctx.cardanoTxCborHex,
    finalitySignature: ctx.finalitySignature,
    btcClaimTxid: ctx.btcClaimTxid,
  };
}
