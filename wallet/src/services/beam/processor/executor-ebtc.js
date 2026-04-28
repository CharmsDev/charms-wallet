/**
 * eBTC Beam Executor — Lock BTC → Mint eBTC → Beam to Cardano.
 *
 * 8 steps:
 *   1. Prove eBTC mint (lock BTC at Scrolls vault, needs ebtc.wasm)
 *   2. Sign + broadcast mint tx on Bitcoin
 *   3. Wait for mint tx confirmation
 *   4. Create Cardano placeholder
 *   5. Wait Cardano confirmation
 *   6. Prove BTC beam-out (simple transfer, no WASM)
 *   7. Sign + broadcast beam-out, wait for 6 BTC blocks
 *   8. Prove + sign + submit Cardano claim
 *
 * Steps 4-8 reuse the standard BRO beam pipeline.
 */

import { BEAM_PHASE } from '../core/types';
import { saveBeamState } from '../core/persistence';
import { SPELL_VERSION, getProverUrl, getMempoolBase } from '@/services/charm-transfer/constants';
import { hexToBytes } from '../core/crypto';
import { cborToHex, utxoIdToBytes, appToCborTuple } from '../core/cbor';
import { dumpBeamPayload } from '../core/debug-dump';

const destToBytes = hexToBytes;

// eBTC constants
const EBTC_APP_ID = '0796f63ed48144b4ec69fb794fbc2290ae63acf945fb035d5474648b50ee43b6';
const EBTC_APP_VK = 'fd0cac892e457454be0212fa7d9a0e1517d5bd6a33aa7c66a1f10f55e375c290';
const EBTC_TOKEN_APP = `t/${EBTC_APP_ID}/${EBTC_APP_VK}`;
const EBTC_VAULT_APP = `c/${EBTC_APP_ID}/${EBTC_APP_VK}`;
const VAULT_DEST = '00141ccbe7f8b1e364fe23110c9f720c2b5c2a37527e';
const DUST_PER_VAULT = 300;

export async function executeEbtcBeam(params) {
  const { beamId, onPhase, signal } = params;
  const ctx = { ...params };
  const save = (phase) => saveBeamState(beamId, { phase, direction: 'ebtc-btc-to-ada', ...snapshot(ctx) });
  console.log('[eBTC] Starting 3-step beam. lockSats:', ctx.lockSats, 'network:', ctx.network);

  const { createPlaceholder } = await import('./steps/step1-placeholder');
  const { waitForCardanoConfirm } = await import('./steps/step2-wait-cardano');
  const { waitForBtcFinal } = await import('./steps/step5-wait-btc-finality');
  const { claimOnCardano } = await import('./steps/step6-claim-cardano');
  const { utxoIdHash } = await import('../core/crypto');

  // ═══ Step 1: ADA placeholder ═══════════════════════════════════════════
  // Placeholder must live at our own Cardano address (so we can spend it in
  // step6). ctx.cardanoAddress is the final DESTINATION (may be external);
  // ctx.cardanoOwnAddress is our funding/signing address.
  if (!ctx.placeholderTxid) {
    onPhase(BEAM_PHASE.CREATING_PLACEHOLDER, 'Creating Cardano placeholder...');
    const ph = await createPlaceholder({
      ...ctx,
      cardanoOwnAddress: ctx.cardanoOwnAddress || ctx.cardanoAddress,
      onStatus: m => onPhase(BEAM_PHASE.CREATING_PLACEHOLDER, m),
    });
    ctx.placeholderTxid = ph.txHash;
    ctx.placeholderVout = ph.outputIndex;
    save(BEAM_PHASE.WAITING_DEST_CONFIRM);
    console.log('[eBTC] Placeholder created:', ctx.placeholderTxid, 'vout:', ctx.placeholderVout);
  }

  onPhase(BEAM_PHASE.WAITING_DEST_CONFIRM, 'Waiting for Cardano confirmation...');
  await waitForCardanoConfirm({ txHash: ctx.placeholderTxid, network: ctx.network, adaNetwork: ctx.adaNetwork, onStatus: m => onPhase(BEAM_PHASE.WAITING_DEST_CONFIRM, m), signal });
  save(BEAM_PHASE.PROVING);

  // ═══ Step 2: BTC mint+beam (single tx) ═════════════════════════════════
  if (!ctx.btcTxid) {
    // Compute beam_to hash from placeholder
    if (!ctx.beamToHash) {
      ctx.beamToHash = await utxoIdHash(ctx.placeholderTxid, ctx.placeholderVout);
      console.log('[eBTC] beamToHash:', ctx.beamToHash);
    }

    if (!ctx.spellTxHex) {
      onPhase(BEAM_PHASE.PROVING, 'Proving eBTC mint + beam (single tx)...');
      const { mintBeamTxHex, mintAmount, btcInputUtxo: selectedUtxo } = await proveMintAndBeam({
        ...ctx,
        beamToHash: ctx.beamToHash,
        onStatus: m => onPhase(BEAM_PHASE.PROVING, m),
      });
      ctx.spellTxHex = mintBeamTxHex;
      ctx.ebtcAmount = mintAmount;
      ctx.btcInputUtxo = selectedUtxo;
      ctx.tokenAppId = EBTC_TOKEN_APP;
      save(BEAM_PHASE.SIGNING_SOURCE);
      console.log('[eBTC] Mint+beam proven. eBTC:', mintAmount, 'funding:', selectedUtxo);
    }

    onPhase(BEAM_PHASE.SIGNING_SOURCE, 'Signing Bitcoin transaction...');
    const { btcTxid } = await signAndBroadcastMintBeam({
      ...ctx,
      onStatus: m => onPhase(BEAM_PHASE.BROADCASTING_SOURCE, m),
    });
    ctx.btcTxid = btcTxid;
    save(BEAM_PHASE.WAITING_FINALITY);
    console.log('[eBTC] BTC mint+beam broadcast:', btcTxid);
  }

  // Wait 6 BTC blocks
  onPhase(BEAM_PHASE.WAITING_FINALITY, 'Waiting for Bitcoin finality (6 blocks, ~60 min)...');
  await waitForBtcFinal({ btcTxid: ctx.btcTxid, network: ctx.network, onStatus: m => onPhase(BEAM_PHASE.WAITING_FINALITY, m), signal });
  save(BEAM_PHASE.CLAIMING_DEST);

  // ═══ Step 3: ADA claim ═════════════════════════════════════════════════
  if (!ctx.adaClaimTxid) {
    ctx.beamAmount = ctx.ebtcAmount;
    ctx.tokenAppId = EBTC_TOKEN_APP;
    onPhase(BEAM_PHASE.CLAIMING_DEST, 'Claiming eBTC on Cardano...');
    const { adaClaimTxid } = await claimOnCardano({
      ...ctx,
      claimTxCborHex: ctx.claimTxCborHex,  // reuse if present (skip prover)
      onProved: async (cborHex) => {
        // Save proven cbor BEFORE sign+broadcast so retry skips prover
        ctx.claimTxCborHex = cborHex;
        save(BEAM_PHASE.CLAIMING_DEST);
        console.log('[eBTC] Claim proven, cbor saved');
      },
      onStatus: m => onPhase(BEAM_PHASE.CLAIMING_DEST, m),
    });
    ctx.adaClaimTxid = adaClaimTxid;
    save(BEAM_PHASE.COMPLETE);
    console.log('[eBTC] Cardano claim:', adaClaimTxid);
  }

  onPhase(BEAM_PHASE.COMPLETE, 'eBTC beam complete!');
  return { btcTxid: ctx.btcTxid, adaClaimTxid: ctx.adaClaimTxid };
}

// ── Combined Mint+Beam Prover ───────────────────────────────────────────────

async function proveMintAndBeam({ beamId, btcInputUtxo, fundingUtxo, btcExtraInputs, lockSats, btcAddress, beamToHash, seedPhrase, network, charms, onStatus }) {
  const mintAmount = lockSats - DUST_PER_VAULT;
  if (mintAmount <= 0) throw new Error(`Lock amount must be > ${DUST_PER_VAULT} sats`);
  console.log('[eBTC:proveMint] lockSats:', lockSats, 'mintAmount:', mintAmount);

  // Honor a pre-selected funding UTXO from the dialog. The dialog also
  // registers it under the beam's reservation entry, so concurrent ops
  // can't re-pick it during the long step-2 wait.
  if (!btcInputUtxo && fundingUtxo?.utxoId) btcInputUtxo = fundingUtxo.utxoId;

  let extraInputUtxoIds = btcExtraInputs || [];

  // Fetch fresh UTXOs from mempool and select funding (avoids stale/spent UTXOs)
  if (!btcInputUtxo) {
    onStatus?.('Fetching fresh UTXOs from mempool...');
    const mempoolBase = getMempoolBase(network);
    const mempoolUtxos = await fetch(`${mempoolBase}/address/${btcAddress}/utxo`).then(r => r.json());
    console.log('[eBTC:proveMint] fresh UTXOs from mempool:', mempoolUtxos.length);

    // Include unconfirmed (mempool) UTXOs — change from a concurrent beam is
    // spendable via chain-of-spend. Reserved UTXOs are filtered inside the
    // selector via getSpentSet('bitcoin').
    const freshUtxos = mempoolUtxos
      .map(u => ({ txid: u.txid, outputIndex: u.vout, vout: u.vout, value: u.value, address: btcAddress, confirmed: !!u.status?.confirmed }));

    const minSats = lockSats + 5000;
    const { selectBtcFundingAccumulated } = await import('../chains/bitcoin/funding');
    const result = selectBtcFundingAccumulated(freshUtxos, charms || [], { minSats });
    if (!result) {
      const available = freshUtxos
        .filter(u => !(charms || []).some(c => c.txid === u.txid && (c.outputIndex === u.outputIndex || c.vout === u.outputIndex)))
        .reduce((s, u) => s + (u.value || 0), 0);
      throw new Error(
        `Insufficient Bitcoin funding. Need ${minSats} sats, have ${available} non-charm sats.`
      );
    }
    btcInputUtxo = result.funding.utxoId;
    extraInputUtxoIds = result.extras.map(e => e.utxoId);
    console.log('[eBTC:proveMint] funding:', result.funding.utxoId, result.funding.value, 'sats',
      result.extras.length ? `(+ ${result.extras.length} extras, total ${result.totalSats} sats)` : '');

    // Register the freshly-picked UTXOs under the beam's operation. If
    // dialog-side selection is missing or insufficient and the executor
    // re-selects from mempool, those UTXOs must still be reserved for the
    // long signing/proving wait. `appendToOperation` is a no-op if the
    // beam isn't tracked yet (defensive).
    if (beamId) {
      try {
        const { appendToOperation } = await import('@/services/utxo-reservations');
        const items = [btcInputUtxo, ...extraInputUtxoIds].map(utxoId => ({ utxoId }));
        appendToOperation(beamId, items);
      } catch (e) {
        console.warn('[eBTC:proveMint] could not append to operation:', e?.message);
      }
    }
    onStatus?.(
      result.extras.length
        ? `Funding: ${result.totalSats} sats across ${result.extras.length + 1} UTXOs`
        : `Funding: ${result.funding.value} sats`
    );
  }
  console.log('[eBTC:proveMint] btcInputUtxo:', btcInputUtxo, 'extras:', extraInputUtxoIds.length);
  console.log('[eBTC:proveMint] btcAddress:', btcAddress);

  onStatus?.('Building eBTC mint spell (CBOR)...');

  // Get user's scriptPubKey as bytes
  const bitcoin = await import('bitcoinjs-lib');
  const userDestHex = bitcoin.address.toOutputScript(btcAddress).toString('hex');
  console.log('[eBTC:proveMint] userDest scriptPubKey:', userDestHex);

  // Build CBOR-encoded spell (same pattern as burn + beam normalizers)
  const appPublicInputs = new Map();
  appPublicInputs.set(appToCborTuple(EBTC_VAULT_APP), null);
  appPublicInputs.set(appToCborTuple(EBTC_TOKEN_APP), null);

  // Convert beamToHash to bytes for beamed_outs
  const beamToBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++)
    beamToBytes[i] = parseInt(beamToHash.substring(i * 2, i * 2 + 2), 16);

  const beamedOuts = new Map();
  beamedOuts.set(0, beamToBytes);  // output 0 (tokens) beamed to Cardano

  // Funding inputs: the primary BTC UTXO + any extras the accumulator picked
  // up when the user's wallet was fragmented. Extras carry only sats (no
  // charm), they sit alongside the main funding input.
  const allInputUtxoIds = [btcInputUtxo, ...extraInputUtxoIds];
  const spellIns = allInputUtxoIds.map(utxoIdToBytes);

  const normalizedSpell = {
    version: SPELL_VERSION,
    tx: {
      ins: spellIns,
      outs: [
        new Map([[1, mintAmount]]),   // tag 1 = token app (eBTC tokens) — beamed to Cardano
        new Map([[0, null]]),         // tag 0 = vault app (vault state) — stays on BTC
      ],
      beamed_outs: beamedOuts,
      coins: [
        { amount: DUST_PER_VAULT, dest: destToBytes(userDestHex) },  // dust for token output (matches mint-token.yaml)
        { amount: lockSats, dest: destToBytes(VAULT_DEST) }, // BTC locked at vault
      ],
    },
    app_public_inputs: appPublicInputs,
  };
  console.log('[eBTC:prove] beamToHash:', beamToHash);

  const spellHex = cborToHex(normalizedSpell);
  console.log('[eBTC:proveMint] spell CBOR hex length:', spellHex.length, 'bytes:', spellHex.length / 2);
  console.log('[eBTC:proveMint] spell hex preview:', spellHex.substring(0, 80) + '...');

  // Fetch prev_txs aligned 1:1 with spell.ins. Cache so duplicate txids only
  // get fetched once (same pattern as eBTC redeem).
  onStatus?.('Fetching previous transactions...');
  const { fetchTxHex } = await import('@/services/charm-transfer/tx-fetcher');
  const txCache = new Map();
  const getTxHex = (txid) => {
    if (!txCache.has(txid)) txCache.set(txid, fetchTxHex(txid, network));
    return txCache.get(txid);
  };
  const prevTxList = await Promise.all(
    allInputUtxoIds.map(async id => ({ bitcoin: await getTxHex(id.split(':')[0]) }))
  );
  console.log('[eBTC:prove] prev_txs:', prevTxList.length);

  onStatus?.('Loading eBTC contract binary...');
  const { loadWasmBase64 } = await import('../chains/wasm-loader');
  const wasmBase64 = await loadWasmBase64('/wasm/ebtc.wasm');
  console.log('[eBTC:prove] wasm:', wasmBase64.length, 'chars');

  // Build prover payload
  const payload = {
    spell: spellHex,
    app_private_inputs: {
      [EBTC_VAULT_APP]: 'f6',
      [EBTC_TOKEN_APP]: 'f6',
    },
    tx_ins_beamed_source_utxos: {},
    binaries: { [EBTC_APP_VK]: wasmBase64 },
    prev_txs: prevTxList,
    change_address: btcAddress,
    fee_rate: 2,
    chain: 'bitcoin',
    collateral_utxo: null,
  };

  console.log('[eBTC:proveMint] payload keys:', Object.keys(payload));
  console.log('[eBTC:proveMint] payload size:', JSON.stringify(payload).length, 'bytes');

  // Prove
  const proverUrl = getProverUrl(network);

  // Uncomment to dump spell + payload to _rjj/tmp for offline inspection.
  // dumpBeamPayload('ebtc-mintbeam', {
  //   version: SPELL_VERSION, input: btcInputUtxo,
  //   outs: [`{1: ${mintAmount}} (eBTC, beamed)`, '{0: null} (vault)'],
  //   beamed_outs: { 0: beamToHash },
  //   coins: [`${DUST_PER_VAULT} sats → user`, `${lockSats} sats → vault`],
  //   apps: [EBTC_VAULT_APP + ' (tag 0)', EBTC_TOKEN_APP + ' (tag 1)'],
  // }, payload);

  onStatus?.('Proving mint+beam (may take a few minutes)...');

  const startTime = Date.now();
  const resp = await fetch(proverUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('[eBTC:proveMint] prover response:', resp.status, `(${elapsed}s)`);

  if (!resp.ok) {
    const errText = await resp.text();
    console.error('[eBTC:proveMint] prover error:', errText);
    throw new Error(`Prover failed: ${errText}`);
  }

  const result = await resp.json();
  const mintBeamTxHex = Array.isArray(result) ? result[0]?.bitcoin : result?.bitcoin;
  if (!mintBeamTxHex) {
    console.error('[eBTC:prove] unexpected result:', JSON.stringify(result).slice(0, 200));
    throw new Error('Prover returned no transaction');
  }

  console.log('[eBTC:prove] unsigned tx:', mintBeamTxHex.length, 'chars');
  return { mintBeamTxHex, mintAmount, btcInputUtxo };
}

// ── Sign + Broadcast combined mint+beam tx ──────────────────────────────────

async function signAndBroadcastMintBeam({ spellTxHex, btcInputUtxo, btcAddress, seedPhrase, network, onStatus }) {
  console.log('[eBTC:sign] tx length:', spellTxHex?.length);
  const { signSpellTxMultiKey } = await import('@/services/charm-transfer/tx-signer');
  const { fetchTxHex } = await import('@/services/charm-transfer/tx-fetcher');
  const bitcoin = await import('bitcoinjs-lib');

  const tx = bitcoin.Transaction.fromHex(spellTxHex);
  console.log('[eBTC:sign] inputs:', tx.ins.length, 'outputs:', tx.outs.length);

  // Fetch ALL prev txs (prover may add fee inputs)
  const prevTxMap = new Map();
  for (const inp of tx.ins) {
    const txid = Buffer.from(inp.hash).reverse().toString('hex');
    if (!prevTxMap.has(txid)) {
      const hex = await fetchTxHex(txid, network);
      prevTxMap.set(txid, hex);
    }
  }
  console.log('[eBTC:sign] prevTxMap:', prevTxMap.size);

  const inputSigningMap = {
    [btcInputUtxo]: { index: 0, isChange: false, address: btcAddress },
  };

  onStatus?.('Signing...');
  const signedHex = await signSpellTxMultiKey(spellTxHex, prevTxMap, inputSigningMap, seedPhrase, network);
  console.log('[eBTC:sign] signed:', signedHex?.length, 'chars');

  onStatus?.('Broadcasting...');
  // Route through the central broadcaster so the funding inputs get marked
  // as reserved post-broadcast. Direct mempool.space POST bypassed the
  // reservation layer and let concurrent ops re-pick the same UTXO.
  const { broadcastTx } = await import('@/services/charm-transfer/broadcaster');
  const btcTxid = await broadcastTx(signedHex, network);
  console.log('[eBTC:sign] txid:', btcTxid);
  return { btcTxid };
}

// ── Snapshot ────────────────────────────────────────────────────────────────

function snapshot(ctx) {
  return {
    direction: 'ebtc-btc-to-ada',
    tokenAppId: EBTC_TOKEN_APP,
    beamAmount: ctx.ebtcAmount || ctx.beamAmount,
    ebtcAmount: ctx.ebtcAmount,
    lockSats: ctx.lockSats,
    cardanoAddress: ctx.cardanoAddress,
    cardanoOwnAddress: ctx.cardanoOwnAddress,
    btcAddress: ctx.btcAddress,
    claimTxCborHex: ctx.claimTxCborHex,
    btcNetwork: ctx.network,
    adaNetwork: ctx.adaNetwork,
    btcInputUtxo: ctx.btcInputUtxo,
    beamToHash: ctx.beamToHash,
    placeholderTxid: ctx.placeholderTxid,
    placeholderVout: ctx.placeholderVout,
    spellTxHex: ctx.spellTxHex,
    btcTxid: ctx.btcTxid,
    adaClaimTxid: ctx.adaClaimTxid,
  };
}
