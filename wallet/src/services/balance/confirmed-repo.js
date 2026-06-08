/**
 * ConfirmedRepo — persistent store of indexer-sealed balances.
 *
 * Layout:
 *
 *   StorageKey: `wallet:balance:confirmed:<chain>:<network>`
 *   Value:      { [assetKey]: { amount: <string>, lastSyncedAt: <number>, source?: <string> } }
 *
 * `amount` is stored as a decimal string because the underlying units
 * are bigints (sats, lovelace, token base units) and JSON has no native
 * bigint. Callers turn it into BigInt at the API surface.
 *
 * One row per (chain, network) — switching network never trashes the
 * other network's snapshot. The in-memory mirror is loaded lazily and
 * write-through on every mutation.
 *
 * No business logic here. Reconciliation lives in BalanceService.
 */

import { StorageAdapter } from '../storage-adapter';
import { isValidAssetKey } from './asset-key';

const KEY_PREFIX = 'wallet:balance:confirmed';

function storageKey(chain, network) {
  if (!chain || !network) {
    throw new Error('ConfirmedRepo: chain and network are required');
  }
  return `${KEY_PREFIX}:${chain}:${network}`;
}

export class ConfirmedRepo {
  constructor() {
    /** @type {Map<string, Map<string, {amount:string, lastSyncedAt:number, source?:string}>>} */
    this._cache = new Map();   // bucketKey → Map<assetKey, slice>
    this._loaded = new Set();  // bucketKeys we've already hydrated
    this._subs = new Set();
  }

  async load(chain, network) {
    const bucketKey = storageKey(chain, network);
    if (this._loaded.has(bucketKey)) return;
    const raw = await StorageAdapter.get(bucketKey);
    const obj = raw ? safeParse(raw) : {};
    const m = new Map();
    for (const [assetKey, slice] of Object.entries(obj)) {
      if (isValidAssetKey(assetKey) && slice && typeof slice.amount === 'string') {
        m.set(assetKey, slice);
      }
    }
    this._cache.set(bucketKey, m);
    this._loaded.add(bucketKey);
  }

  get(chain, network, assetKey) {
    const m = this._cache.get(storageKey(chain, network));
    if (!m) return null;
    return m.get(assetKey) || null;
  }

  getAll(chain, network) {
    const m = this._cache.get(storageKey(chain, network));
    if (!m) return new Map();
    return new Map(m);  // snapshot
  }

  async set(chain, network, assetKey, slice) {
    if (!isValidAssetKey(assetKey)) {
      throw new Error(`ConfirmedRepo.set: invalid assetKey "${assetKey}"`);
    }
    if (!slice || typeof slice.amount !== 'string') {
      throw new Error('ConfirmedRepo.set: slice.amount must be a string');
    }
    await this.load(chain, network);
    const bucketKey = storageKey(chain, network);
    const m = this._cache.get(bucketKey);
    m.set(assetKey, { ...slice });
    await this._persist(bucketKey, m);
    this._emit({ chain, network, assetKey });
  }

  async setBatch(chain, network, entries) {
    await this.load(chain, network);
    const bucketKey = storageKey(chain, network);
    const m = this._cache.get(bucketKey);
    for (const [assetKey, slice] of entries) {
      if (!isValidAssetKey(assetKey)) continue;
      if (!slice || typeof slice.amount !== 'string') continue;
      m.set(assetKey, { ...slice });
    }
    await this._persist(bucketKey, m);
    this._emit({ chain, network, batch: true });
  }

  async clear(chain, network) {
    const bucketKey = storageKey(chain, network);
    this._cache.delete(bucketKey);
    this._loaded.delete(bucketKey);
    await StorageAdapter.remove(bucketKey);
    this._emit({ chain, network, cleared: true });
  }

  subscribe(callback) {
    this._subs.add(callback);
    return () => this._subs.delete(callback);
  }

  async _persist(bucketKey, m) {
    const obj = Object.fromEntries(m);
    await StorageAdapter.set(bucketKey, JSON.stringify(obj));
  }

  _emit(event) {
    for (const cb of this._subs) {
      try { cb(event); } catch (e) { console.error('ConfirmedRepo subscriber threw:', e); }
    }
  }
}

function safeParse(raw) {
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return {}; }
}

export const confirmedRepo = new ConfirmedRepo();
