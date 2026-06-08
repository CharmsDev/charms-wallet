/**
 * PendingRepo — persistent registry of every in-flight balance op.
 *
 * One global bucket — `wallet:balance:pending` — keyed by `opId`.
 * Each entry carries its own (chain, network) so a single repo can
 * track ops across both chains, including cross-chain beams.
 *
 * Survives reload (resolves the bug where pendingCharms / pendingCnt
 * disappeared on refresh). Auto-clear only happens via explicit state
 * transitions, never by a wall-clock timer.
 *
 * No state machine validation here — the caller passes already-validated
 * states. This file just owns persistence + indexes.
 */

import { StorageAdapter } from '../storage-adapter';
import { isValidAssetKey } from './asset-key';
import { isTerminal } from './pending-state-machine';

const STORAGE_KEY = 'wallet:balance:pending';

/**
 * @typedef {object} PendingEntry
 * @property {string}  opId
 * @property {'outgoing'|'incoming'|'xchain-out'|'xchain-in'} kind
 * @property {string}  assetKey         canonical AssetKey
 * @property {string}  network          'mainnet' | 'testnet4' | 'preprod' | ...
 * @property {string}  amount           bigint as decimal string
 * @property {string}  state            from pending-state-machine STATE
 * @property {string}  [txid]           known once broadcast
 * @property {string}  [relatedOpId]    links xchain-out ↔ xchain-in, or self-transfers
 * @property {string}  [label]          human-readable (e.g. "Charm Transfer")
 * @property {number}  createdAt
 * @property {number}  lastChangedAt
 */

const VALID_KINDS = new Set(['outgoing', 'incoming', 'xchain-out', 'xchain-in']);

export class PendingRepo {
  constructor() {
    /** @type {Map<string, PendingEntry>} */
    this._byOp = new Map();
    /** @type {Map<string, Set<string>>}  txid → Set<opId> */
    this._byTxid = new Map();
    this._loaded = false;
    this._subs = new Set();
  }

  async load() {
    if (this._loaded) return;
    const raw = await StorageAdapter.get(STORAGE_KEY);
    const obj = raw ? safeParse(raw) : {};
    for (const [opId, entry] of Object.entries(obj)) {
      if (!isValidEntry(entry)) continue;
      this._byOp.set(opId, entry);
      this._indexTxid(entry);
    }
    this._loaded = true;
  }

  get(opId) {
    return this._byOp.get(opId) || null;
  }

  getAll() {
    return [...this._byOp.values()];
  }

  /** All live + terminal entries for an asset on a given network. */
  queryByAsset(assetKey, network) {
    const out = [];
    for (const e of this._byOp.values()) {
      if (e.assetKey === assetKey && e.network === network) out.push(e);
    }
    return out;
  }

  /** All entries (any state) matching a txid — used to reconcile sync. */
  queryByTxid(txid) {
    const ids = this._byTxid.get(txid);
    if (!ids) return [];
    return [...ids].map(id => this._byOp.get(id)).filter(Boolean);
  }

  async create(entry) {
    if (!isValidEntry(entry)) {
      throw new Error(`PendingRepo.create: invalid entry — ${JSON.stringify(entry)}`);
    }
    if (this._byOp.has(entry.opId)) {
      // Idempotent — same opId is a no-op (use update() to mutate).
      return this._byOp.get(entry.opId);
    }
    const stamped = { ...entry, lastChangedAt: entry.lastChangedAt ?? entry.createdAt };
    this._byOp.set(entry.opId, stamped);
    this._indexTxid(stamped);
    await this._persist();
    this._emit({ kind: 'created', opId: entry.opId });
    return stamped;
  }

  async update(opId, patch) {
    const current = this._byOp.get(opId);
    if (!current) throw new Error(`PendingRepo.update: unknown opId "${opId}"`);

    // If txid changed (e.g. set on broadcast), reindex.
    const next = { ...current, ...patch, lastChangedAt: Date.now() };
    if (!isValidEntry(next)) {
      throw new Error('PendingRepo.update: patch produces an invalid entry');
    }
    if (patch.txid && patch.txid !== current.txid) {
      this._unindexTxid(current);
      this._byOp.set(opId, next);
      this._indexTxid(next);
    } else {
      this._byOp.set(opId, next);
    }
    await this._persist();
    this._emit({ kind: 'updated', opId, patch });
    return next;
  }

  async delete(opId) {
    const current = this._byOp.get(opId);
    if (!current) return false;
    this._unindexTxid(current);
    this._byOp.delete(opId);
    await this._persist();
    this._emit({ kind: 'deleted', opId });
    return true;
  }

  /** Drop every terminal entry — used after the indexer has confirmed
   *  them, when the UI no longer needs the history rows. */
  async purgeTerminal() {
    const drop = [];
    for (const [opId, e] of this._byOp) {
      if (isTerminal(e.state)) drop.push(opId);
    }
    if (drop.length === 0) return 0;
    for (const opId of drop) {
      const e = this._byOp.get(opId);
      this._unindexTxid(e);
      this._byOp.delete(opId);
    }
    await this._persist();
    this._emit({ kind: 'purged', count: drop.length });
    return drop.length;
  }

  async clearAll() {
    this._byOp.clear();
    this._byTxid.clear();
    await StorageAdapter.remove(STORAGE_KEY);
    this._emit({ kind: 'cleared' });
  }

  subscribe(callback) {
    this._subs.add(callback);
    return () => this._subs.delete(callback);
  }

  _indexTxid(entry) {
    if (!entry.txid) return;
    let s = this._byTxid.get(entry.txid);
    if (!s) { s = new Set(); this._byTxid.set(entry.txid, s); }
    s.add(entry.opId);
  }

  _unindexTxid(entry) {
    if (!entry.txid) return;
    const s = this._byTxid.get(entry.txid);
    if (!s) return;
    s.delete(entry.opId);
    if (s.size === 0) this._byTxid.delete(entry.txid);
  }

  async _persist() {
    const obj = Object.fromEntries(this._byOp);
    await StorageAdapter.set(STORAGE_KEY, JSON.stringify(obj));
  }

  _emit(event) {
    for (const cb of this._subs) {
      try { cb(event); } catch (e) { console.error('PendingRepo subscriber threw:', e); }
    }
  }
}

function isValidEntry(e) {
  return e && typeof e === 'object'
    && typeof e.opId === 'string' && e.opId.length > 0
    && VALID_KINDS.has(e.kind)
    && typeof e.assetKey === 'string' && isValidAssetKey(e.assetKey)
    && typeof e.network === 'string' && e.network.length > 0
    && typeof e.amount === 'string' && /^-?\d+$/.test(e.amount)
    && typeof e.state === 'string'
    && typeof e.createdAt === 'number';
}

function safeParse(raw) {
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return {}; }
}

export const pendingRepo = new PendingRepo();
