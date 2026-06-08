/**
 * BalanceService — the only thing that knows what your balance is.
 *
 * Owns reads + writes for both `confirmed` (indexer-sealed) and
 * `pending` (in-flight) state. Flows declare intent ("I'm about to
 * send X"); the service updates the registry; UI subscribes to
 * `getBalance(assetKey, network)` and gets a single number.
 *
 *   Balance =
 *     confirmed
 *     − sum(live outgoing/xchain-out for this asset on this network)
 *     + sum(live incoming/xchain-in  for this asset on this network)
 *
 * `live` is defined by pending-state-machine.isLive (CREATED through
 * IN_BLOCK). CONFIRMED / FAILED / DROPPED don't shift the balance —
 * they are either already baked into `confirmed` (CONFIRMED) or never
 * happened (FAILED / DROPPED).
 *
 * Reservation integration: registerOutgoing reserves the UTXOs it
 * names; markFailed / markDropped release them. Flows never call
 * utxo-reservations directly anymore — the service is the gateway.
 *
 * Threading model: synchronous reads, async writes (storage is async).
 * No queues, no locks — Zustand-style snapshot semantics. If two
 * writes race on the same opId, the state machine catches illegal
 * transitions.
 */

import { confirmedRepo as defaultConfirmedRepo } from './confirmed-repo';
import { pendingRepo  as defaultPendingRepo  } from './pending-repo';
import { triggerHub   as defaultTriggerHub   } from './trigger-hub';
import { reservations as defaultReservations } from '../utxo-reservations';
import {
  STATE, EVENT,
  nextState, isLive, isTerminal,
} from './pending-state-machine';
import { isValidAssetKey, parseAssetKey } from './asset-key';

const ZERO = 0n;

function toBig(s) {
  if (typeof s !== 'string') return ZERO;
  try { return BigInt(s); } catch { return ZERO; }
}

const OUTGOING_KINDS = new Set(['outgoing', 'xchain-out']);
const INCOMING_KINDS = new Set(['incoming', 'xchain-in']);

export class BalanceService {
  constructor({
    confirmedRepo  = defaultConfirmedRepo,
    pendingRepo    = defaultPendingRepo,
    triggerHub     = defaultTriggerHub,
    reservations   = defaultReservations,
    clock          = () => Date.now(),
  } = {}) {
    this._confirmed   = confirmedRepo;
    this._pending     = pendingRepo;
    this._triggers    = triggerHub;
    this._reservations = reservations;
    this._clock       = clock;
    this._subs        = new Map();   // assetKey → Set<cb>
    this._inTransitSubs = new Set();

    this._unsubConfirmed = this._confirmed.subscribe(e => this._fanout(e.assetKey));
    this._unsubPending   = this._pending.subscribe(e => {
      this._fanout(/* asset unknown — broadcast all */ null);
      for (const cb of this._inTransitSubs) {
        try { cb(e); } catch (err) { console.error('inTransit subscriber threw:', err); }
      }
    });
  }

  async loadFor(chain, network) {
    await Promise.all([
      this._confirmed.load(chain, network),
      this._pending.load(),
    ]);
  }

  // ─── Reads ─────────────────────────────────────────────────────────

  /** @returns {{confirmed:bigint, pendingOut:bigint, pendingIn:bigint, inFlight:bigint, displayed:bigint, lastSyncedAt:number|null}} */
  getBalance(assetKey, network) {
    if (!isValidAssetKey(assetKey)) {
      throw new Error(`BalanceService.getBalance: invalid assetKey "${assetKey}"`);
    }
    const { chain } = parseAssetKey(assetKey);
    const slice = this._confirmed.get(chain, network, assetKey);
    const confirmed = slice ? toBig(slice.amount) : ZERO;
    const lastSyncedAt = slice?.lastSyncedAt ?? null;

    let pendingOut = ZERO, pendingIn = ZERO, inFlight = ZERO;
    for (const e of this._pending.queryByAsset(assetKey, network)) {
      if (!isLive(e.state)) continue;
      const amt = toBig(e.amount);
      if (e.kind === 'outgoing')   pendingOut += amt;
      if (e.kind === 'incoming')   pendingIn  += amt;
      if (e.kind === 'xchain-out') { pendingOut += amt; inFlight += amt; }
      if (e.kind === 'xchain-in')  { pendingIn  += amt; inFlight += amt; }
    }
    return {
      confirmed,
      pendingOut,
      pendingIn,
      inFlight,
      displayed: confirmed - pendingOut + pendingIn,
      lastSyncedAt,
    };
  }

  /** Live (non-terminal) pending entries — used by the in-transit UI panel. */
  getInTransit({ chain, network } = {}) {
    return this._pending.getAll().filter(e => {
      if (!isLive(e.state)) return false;
      if (chain) {
        const { chain: c } = parseAssetKey(e.assetKey);
        if (c !== chain) return false;
      }
      if (network && e.network !== network) return false;
      return true;
    });
  }

  // ─── Writes — flow declares intent ─────────────────────────────────

  async registerOutgoing({ opId, assetKey, network, amount, label, relatedOpId, reserveUtxos }) {
    return this._register({
      opId, assetKey, network, amount, label, relatedOpId,
      kind: 'outgoing', reserveUtxos,
    });
  }

  async registerIncoming({ opId, assetKey, network, amount, label, relatedOpId }) {
    return this._register({
      opId, assetKey, network, amount, label, relatedOpId,
      kind: 'incoming',
    });
  }

  /**
   * Cross-chain op. Creates BOTH sides atomically with shared opId
   * (outgoing side suffixed `:out`, incoming side suffixed `:in`).
   *
   * Reserved UTXOs are bound to the `:out` side.
   */
  async registerXChain({ opId, fromAssetKey, toAssetKey, fromNetwork, toNetwork, amount, label, reserveUtxos }) {
    const outId = `${opId}:out`;
    const inId  = `${opId}:in`;
    await this._register({
      opId: outId, kind: 'xchain-out',
      assetKey: fromAssetKey, network: fromNetwork,
      amount, label, relatedOpId: inId, reserveUtxos,
    });
    await this._register({
      opId: inId, kind: 'xchain-in',
      assetKey: toAssetKey, network: toNetwork,
      amount, label, relatedOpId: outId,
    });
    return { outId, inId };
  }

  // ─── Writes — lifecycle transitions ────────────────────────────────

  async markBroadcast(opId, txid)            { return this._transition(opId, EVENT.BROADCAST, { txid }); }
  async markMempoolSeen(opId, txid)          { return this._transition(opId, EVENT.MEMPOOL_SEEN, txid ? { txid } : {}); }
  async markInBlock(opId, blockHeight)       { return this._transition(opId, EVENT.BLOCK_SEEN, blockHeight ? { blockHeight } : {}); }
  async markConfirmed(opId)                  { return this._transition(opId, EVENT.CONFIRM); }
  async markFailed(opId, reason = 'unknown') { return this._transition(opId, EVENT.FAIL, { failureReason: reason }); }
  async markDropped(opId)                    { return this._transition(opId, EVENT.DROP); }

  // ─── Indexer reconciliation ────────────────────────────────────────

  /**
   * Apply a sync result from a chain indexer:
   *   - update confirmed balances for the listed assets
   *   - reconcile every pending entry on this (chain, network) against
   *     the indexer's view of which txids are mempool/in-block
   *
   * Shape:
   *   {
   *     balances:  Map<assetKey, { amount: <string> }>,
   *     mempool:   Set<txid>,
   *     inBlock:   Map<txid, blockHeight>,
   *     missingAfter: number,   // blocks since a tx was last seen — drop threshold
   *   }
   */
  async onSyncResult(chain, network, result) {
    const now = this._clock();
    if (result.balances && result.balances.size > 0) {
      const entries = [];
      for (const [assetKey, slice] of result.balances) {
        entries.push([assetKey, { amount: slice.amount, lastSyncedAt: now, source: 'sync' }]);
      }
      await this._confirmed.setBatch(chain, network, entries);
    }

    const mempool = result.mempool || new Set();
    const inBlock = result.inBlock || new Map();

    for (const e of this._pending.getAll()) {
      if (e.network !== network) continue;
      const { chain: c } = parseAssetKey(e.assetKey);
      if (c !== chain) continue;
      if (!e.txid) continue;
      if (isTerminal(e.state)) continue;

      if (inBlock.has(e.txid)) {
        if (e.state !== STATE.IN_BLOCK && e.state !== STATE.CONFIRMED) {
          await this._transitionEntry(e, EVENT.BLOCK_SEEN, { blockHeight: inBlock.get(e.txid) });
        }
      } else if (mempool.has(e.txid)) {
        if (e.state === STATE.BROADCAST) {
          await this._transitionEntry(e, EVENT.MEMPOOL_SEEN);
        }
      }
      // "Missing for N blocks → drop" handling is left to the caller —
      // they pass an explicit drop list in a future result. We don't
      // invent timeouts here.
    }
  }

  // ─── Subscriptions ─────────────────────────────────────────────────

  /** Subscribe to changes affecting a single assetKey. Pass null to
   *  receive all changes (the in-transit panel uses this). */
  subscribe(assetKey, callback) {
    const key = assetKey || '*';
    if (!this._subs.has(key)) this._subs.set(key, new Set());
    this._subs.get(key).add(callback);
    return () => {
      const s = this._subs.get(key);
      if (!s) return;
      s.delete(callback);
      if (s.size === 0) this._subs.delete(key);
    };
  }

  subscribeInTransit(callback) {
    this._inTransitSubs.add(callback);
    return () => this._inTransitSubs.delete(callback);
  }

  // ─── Internals ─────────────────────────────────────────────────────

  async _register({ opId, kind, assetKey, network, amount, label, relatedOpId, reserveUtxos }) {
    if (!opId || typeof opId !== 'string') {
      throw new Error('BalanceService: opId is required');
    }
    if (!isValidAssetKey(assetKey)) {
      throw new Error(`BalanceService: invalid assetKey "${assetKey}"`);
    }
    if (typeof amount !== 'string' || !/^-?\d+$/.test(amount)) {
      throw new Error('BalanceService: amount must be a non-negative bigint string');
    }
    if (toBig(amount) <= ZERO) {
      throw new Error('BalanceService: amount must be > 0');
    }

    const entry = {
      opId, kind, assetKey, network, amount,
      state: STATE.CREATED,
      createdAt: this._clock(),
      ...(label ? { label } : {}),
      ...(relatedOpId ? { relatedOpId } : {}),
    };
    await this._pending.create(entry);

    // Outgoing kinds may carry UTXOs to lock until the op resolves.
    if (OUTGOING_KINDS.has(kind) && Array.isArray(reserveUtxos) && reserveUtxos.length > 0) {
      const { chain } = parseAssetKey(assetKey);
      try {
        this._reservations.reserveForOperation(opId, chain, reserveUtxos, label || opId);
      } catch (e) {
        console.error('BalanceService: reserveForOperation failed', e);
      }
    }
    return entry;
  }

  async _transition(opId, event, patch = {}) {
    const current = this._pending.get(opId);
    if (!current) throw new Error(`BalanceService: unknown opId "${opId}"`);
    return this._transitionEntry(current, event, patch);
  }

  async _transitionEntry(entry, event, patch = {}) {
    const next = nextState(entry.state, event);
    const updated = await this._pending.update(entry.opId, { ...patch, state: next });

    // Release reservation when an outgoing op definitively ends without
    // producing the expected spend (failed/dropped). On `confirmed` we
    // leave it — the chain has consumed the UTXOs.
    if (OUTGOING_KINDS.has(updated.kind) && (next === STATE.FAILED || next === STATE.DROPPED)) {
      try {
        this._reservations.releaseOperation(updated.opId);
      } catch (e) {
        console.error('BalanceService: releaseOperation failed', e);
      }
    }
    return updated;
  }

  _fanout(assetKey) {
    const fire = (cbs) => { for (const cb of cbs) { try { cb(assetKey); } catch (e) { console.error('balance subscriber threw:', e); } } };
    if (assetKey) {
      const s = this._subs.get(assetKey);
      if (s) fire(s);
    } else {
      for (const s of this._subs.values()) fire(s);
    }
    const wildcard = this._subs.get('*');
    if (wildcard && assetKey) fire(wildcard);
  }
}

export const balanceService = new BalanceService();
