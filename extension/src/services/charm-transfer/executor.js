/**
 * Charm Transfer Executor (v10)
 *
 * Two-phase orchestrator — allows UI to show a confirmation dialog between
 * proving and signing:
 *
 *   Phase 1 — proveCharmTransfer (steps 1-5):
 *     1. spell-builder.js     → build human-friendly spell object
 *     2. spell-normalizer.js  → encode to CBOR hex for prover
 *     3. tx-fetcher.js        → fetch prev_txs for all inputs
 *     4. prover-client.js     → send to prover, get unsigned TX
 *     5. tx-fetcher.js        → fetch any extra prev_txs prover added
 *     → returns { spellTxHex, prevTxMap, fee }
 *
 *   Phase 2 — signAndBroadcastTransfer (steps 6-7):
 *     6. tx-signer.js         → sign all wallet inputs (multi-key)
 *     7. broadcaster.js       → broadcast via Explorer API (fallback mempool)
 *     → returns { txid }
 */

import { DEFAULT_FEE_RATE } from './constants.js';
import { buildTransferSpell } from './spell-builder.js';
import { normalizeSpell } from './spell-normalizer.js';
import { fetchPrevTxs, fetchTxHex } from './tx-fetcher.js';
import { proveTransfer } from './prover-client.js';
import { signSpellTxMultiKey } from './tx-signer.js';
import { broadcastTx } from './broadcaster.js';

// ── Phase 1: Build spell + prove ─────────────────────────────────────────────

/**
 * Build spell, normalize, fetch prev_txs, send to prover.
 * Returns the unsigned TX hex + prevTxMap + estimated fee.
 * The caller should show a confirmation dialog before proceeding to phase 2.
 *
 * @param {object} params
 * @param {string}  params.tokenAppId
 * @param {Array<{utxoId:string, amount:number}>} params.charmInputs
 * @param {{utxoId:string, value:number}} params.fundingUtxo
 * @param {number}  params.transferAmount     raw token units
 * @param {string}  params.recipientAddress
 * @param {string}  params.changeAddress
 * @param {string}  params.network            'mainnet' | 'testnet4'
 * @param {function} params.onStatus          (msg: string) => void
 * @returns {{ spellTxHex: string, prevTxMap: Map, fee: number }}
 */
export async function proveCharmTransfer(params) {
  const {
    tokenAppId, charmInputs, fundingUtxo, transferAmount,
    recipientAddress, changeAddress, network, onStatus,
  } = params;

  const status = msg => { console.log('[CharmTransfer]', msg); onStatus?.(msg); };

  // ── Step 1: Build spell ────────────────────────────────────────────────────
  status('Building transfer spell…');
  const spell = buildTransferSpell({
    tokenAppId, charmInputs, fundingUtxo,
    transferAmount, recipientAddress, changeAddress,
  });
  console.log('[CharmTransfer] Spell:', JSON.stringify(spell, null, 2));

  // ── Step 2: Normalize → CBOR hex ──────────────────────────────────────────
  status('Normalizing spell…');
  const { normalizedSpellHex, appPrivateInputs, txInsBeamedSourceUtxos } = normalizeSpell(spell);

  // ── Step 3: Fetch prev_txs for all spell inputs ───────────────────────────
  status('Fetching input transactions…');
  const prevTxMap = await fetchPrevTxs(spell.ins, network);
  const prevTxs = spell.ins.map(inp => {
    const txid = inp.utxo_id.split(':')[0];
    const hex = prevTxMap.get(txid);
    if (!hex) throw new Error(`Missing tx hex for ${txid}`);
    return { bitcoin: hex };
  });

  // ── Step 4: Send to prover ────────────────────────────────────────────────
  status('Generating ZK proof (this can take 5–10 min)…');
  const payload = {
    spell: normalizedSpellHex,
    app_private_inputs: appPrivateInputs,
    tx_ins_beamed_source_utxos: txInsBeamedSourceUtxos,
    binaries: {},
    prev_txs: prevTxs,
    change_address: changeAddress,
    fee_rate: DEFAULT_FEE_RATE,
    chain: 'bitcoin',
    collateral_utxo: null,
  };
  const spellTxHex = await proveTransfer(payload, network, status);
  status(`Prover returned TX (${spellTxHex.length / 2} bytes)`);

  // ── Step 5: Fetch extra prev_txs (prover may add funding inputs) ──────────
  status('Fetching any extra input transactions…');
  const bitcoin = await import('bitcoinjs-lib');
  const spellTx = bitcoin.Transaction.fromHex(spellTxHex);
  for (const inp of spellTx.ins) {
    const txid = Buffer.from(inp.hash).reverse().toString('hex');
    if (!prevTxMap.has(txid)) {
      const hex = await fetchTxHex(txid, network);
      prevTxMap.set(txid, hex);
    }
  }

  // Compute fee: sum(input values) - sum(output values)
  let totalIn = 0;
  for (const inp of spellTx.ins) {
    const prevTxid = Buffer.from(inp.hash).reverse().toString('hex');
    const prevTxHex = prevTxMap.get(prevTxid);
    if (prevTxHex) {
      const prevTx = bitcoin.Transaction.fromHex(prevTxHex);
      totalIn += prevTx.outs[inp.index]?.value ?? 0;
    }
  }
  const totalOut = spellTx.outs.reduce((s, o) => s + o.value, 0);
  const fee = totalIn - totalOut;

  return { spellTxHex, prevTxMap, fee };
}

// ── Phase 2: Sign + broadcast ────────────────────────────────────────────────

/**
 * Sign the unsigned spell TX and broadcast it.
 * Call this after the user confirms the transaction.
 *
 * @param {object} params
 * @param {string}  params.spellTxHex         unsigned TX from phase 1
 * @param {Map}     params.prevTxMap          txid → hex from phase 1
 * @param {Object}  params.inputSigningMap    { "txid:vout": { address, index, isChange } }
 * @param {string}  params.seedPhrase
 * @param {string}  params.network            'mainnet' | 'testnet4'
 * @param {function} params.onStatus          (msg: string) => void
 * @returns {{ txid: string }}
 */
export async function signAndBroadcastTransfer(params) {
  const {
    spellTxHex, prevTxMap, inputSigningMap,
    seedPhrase, network, onStatus,
  } = params;

  const status = msg => { console.log('[CharmTransfer]', msg); onStatus?.(msg); };

  // ── Step 6: Sign all wallet inputs (multi-key) ───────────────────────────
  status('Signing transaction…');
  const signedTxHex = await signSpellTxMultiKey(
    spellTxHex, prevTxMap, inputSigningMap, seedPhrase, network,
  );

  // ── Step 7: Broadcast ─────────────────────────────────────────────────────
  status('Broadcasting transaction…');
  const txid = await broadcastTx(signedTxHex, network);
  status(`Broadcast OK — txid: ${txid}`);

  return { txid };
}
