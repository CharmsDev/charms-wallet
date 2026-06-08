/**
 * Post-broadcast bookkeeping — single entry point for every BTC tx the
 * wallet sends. Call this exactly once per broadcasted tx; idempotent on
 * repeat calls.
 *
 * What it does, in order:
 *   1. Parses the signed tx (vin + vout + own/external classification).
 *   2. Advances BalanceService pendings for opId + childOpIds.
 *   3. Removes spent UTXOs from `utxoStore` and spent charms from
 *      `charmsStore` so the dashboard reflects the move immediately.
 *   4. Persists the tx to `transactionStore` with the right `type` so
 *      "Recent Transactions" shows it instantly — no dependency on the
 *      indexer / explorer (the indexer only flips status later).
 *
 * The wallet is the source of truth for anything it broadcasts. External
 * APIs (mempool, charms-explorer) only upgrade `status` from pending to
 * confirmed; they never invent or remove the row.
 */

import * as bitcoin from 'bitcoinjs-lib';
import { balanceService } from '@/services/balance';

const SENT_BTC          = 'sent';
const CHARM_TRANSFER    = 'charm_transfer';

/**
 * @param {object} args
 * @param {string}    args.signedTxHex
 * @param {string}    args.txid
 * @param {string}    args.network                'mainnet' | 'testnet4'
 * @param {string}    args.opId                   parent BalanceService op
 * @param {string[]}  [args.childOpIds]           change / self pendings
 * @param {Array}     args.ownAddresses           [{address}, ...] from addressesStore
 * @param {'sent'|'charm_transfer'} args.txType
 * @param {string}    args.label
 * @param {object}    [args.charmContext]         { tokenAppId, name, ticker, image, transferAmount, recipientAddress }
 * @param {number}    [args.feePaid]              sats (override if known)
 * @returns {Promise<void>}
 */
export async function applyBroadcastedTx({
  signedTxHex, txid, network,
  opId, childOpIds = [],
  ownAddresses = [], txType, label,
  charmContext = null, feePaid = null,
}) {
  if (!signedTxHex || !txid) throw new Error('applyBroadcastedTx: signedTxHex and txid are required');

  // ── 1. Parse + classify ───────────────────────────────────────────────────
  const parsed = parseBroadcast(signedTxHex, network, new Set(ownAddresses.map(a => a.address)));

  // ── 2. BalanceService — parent + every child (change, self, ...) ─────────
  try { await balanceService.markBroadcast(opId, txid); } catch (e) { console.error('[post-broadcast] markBroadcast(parent) failed:', e); }
  for (const childId of childOpIds) {
    try { await balanceService.markBroadcast(childId, txid); }
    catch (e) { console.error(`[post-broadcast] markBroadcast(${childId}) failed:`, e); }
  }

  // ── 3. Optimistic store updates ──────────────────────────────────────────
  await dropSpentFromUtxoStore(parsed.inputs, network);
  await dropSpentCharms(parsed.inputs);

  // ── 4. Persist to tx history ─────────────────────────────────────────────
  try {
    const { useTransactionStore } = await import('@/stores/transactionStore');
    const record = buildTxRecord({ parsed, txid, txType, label, charmContext, feePaid });
    await useTransactionStore.getState().recordSentTransaction(record, 'bitcoin', network);
  } catch (e) { console.error('[post-broadcast] recordSentTransaction failed:', e); }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Parsing + classification
// ─────────────────────────────────────────────────────────────────────────────

function bitcoinNetwork(network) {
  return network === 'mainnet' ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
}

/**
 * Decode the signed tx into a plain shape:
 *   inputs:  [{ txid, vout }]
 *   outputs: [{ vout, value, address, isOwn }]
 *   totalOut, ownOutValue
 */
function parseBroadcast(signedTxHex, network, ownAddressSet) {
  const net = bitcoinNetwork(network);
  const tx = bitcoin.Transaction.fromHex(signedTxHex);

  const inputs = tx.ins.map((inp) => ({
    txid: Buffer.from(inp.hash).reverse().toString('hex'),
    vout: inp.index,
  }));

  const outputs = tx.outs.map((out, i) => {
    let address = null;
    try { address = bitcoin.address.fromOutputScript(out.script, net); }
    catch { /* OP_RETURN or non-standard */ }
    return {
      vout: i,
      value: out.value,
      address,
      isOwn: !!(address && ownAddressSet.has(address)),
    };
  });

  const totalOut = outputs.reduce((s, o) => s + o.value, 0);
  const ownOutValue = outputs.filter(o => o.isOwn).reduce((s, o) => s + o.value, 0);

  return { inputs, outputs, totalOut, ownOutValue };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Optimistic store updates
// ─────────────────────────────────────────────────────────────────────────────

async function dropSpentFromUtxoStore(inputs, network) {
  try {
    const { useUTXOStore } = await import('@/stores/utxoStore');
    const updateAfterTransaction = useUTXOStore.getState().updateAfterTransaction;
    const spent = inputs.map(i => ({ txid: i.txid, vout: i.vout }));
    if (spent.length) await updateAfterTransaction(spent, {}, 'bitcoin', network);
  } catch (e) { console.warn('[post-broadcast] utxoStore.updateAfterTransaction failed:', e?.message); }
}

async function dropSpentCharms(inputs) {
  try {
    const { useCharmsStore } = await import('@/stores/charms');
    const removeCharm = useCharmsStore.getState().removeCharm;
    for (const inp of inputs) removeCharm({ txid: inp.txid, vout: inp.vout });
  } catch (e) { console.warn('[post-broadcast] charmsStore.removeCharm failed:', e?.message); }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Tx history record
// ─────────────────────────────────────────────────────────────────────────────

function buildTxRecord({ parsed, txid, txType, label, charmContext, feePaid }) {
  const { outputs } = parsed;
  const ownAddrs = outputs.filter(o => o.isOwn).map(o => o.address);
  const extAddrs = outputs.filter(o => o.address && !o.isOwn).map(o => o.address);

  const toAddresses = txType === CHARM_TRANSFER && charmContext?.recipientAddress
    ? [charmContext.recipientAddress]
    : (extAddrs.length ? extAddrs : ownAddrs);

  const fromAddresses = parsed.inputs.map(i => `${i.txid}:${i.vout}`);

  const record = {
    id: `tx_${Date.now()}_${txType}_${Math.random().toString(36).slice(2, 9)}`,
    txid,
    type: txType,
    amount: feePaid ?? 0,
    fee: feePaid ?? 0,
    timestamp: Date.now(),
    status: 'pending',
    addresses: { from: fromAddresses, to: toAddresses },
    metadata: { label, ...(charmContext || {}) },
  };
  if (txType === CHARM_TRANSFER && charmContext) {
    record.metadata.isCharmTransfer = true;
    record.metadata.charmAmount = charmContext.transferAmount;
    record.metadata.charmName = charmContext.name;
    record.metadata.ticker = charmContext.ticker;
  }
  return record;
}
