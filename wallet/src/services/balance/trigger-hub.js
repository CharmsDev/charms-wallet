/**
 * TriggerHub — decouples "I want a sync" from "who actually runs it".
 *
 * Phase 0 keeps this deliberately tiny:
 *
 *   - Flows / UI / the service push a sync request:
 *       hub.requestSync(chain, network, reason)
 *
 *   - One runner per chain registers itself:
 *       hub.registerRunner(chain, async ({network, reason}) => {...})
 *
 *   - Anyone can subscribe to the result stream:
 *       hub.onResult(cb) → unsub
 *
 * Coalescing: a request fired while one is already in-flight for the
 * same (chain, network) is folded into the in-flight run instead of
 * spawning a second one. Reasons are concatenated for diagnostics.
 *
 * No backoff / polling here yet — useWalletSync stays in charge of
 * periodic refreshes during the migration. Backoff scheduling for
 * pending entries arrives in a later phase.
 */

export class TriggerHub {
  constructor() {
    this._runners = new Map();    // chain → runner fn
    this._inFlight = new Map();   // `${chain}:${network}` → { promise, reasons[] }
    this._resultSubs = new Set();
  }

  registerRunner(chain, runner) {
    if (typeof runner !== 'function') {
      throw new Error('TriggerHub.registerRunner: runner must be a function');
    }
    this._runners.set(chain, runner);
    return () => {
      if (this._runners.get(chain) === runner) this._runners.delete(chain);
    };
  }

  hasRunner(chain) { return this._runners.has(chain); }

  async requestSync(chain, network, reason = 'manual') {
    if (!chain || !network) {
      throw new Error('TriggerHub.requestSync: chain and network are required');
    }
    const runner = this._runners.get(chain);
    if (!runner) {
      // No runner registered yet — silently drop (useful during boot).
      this._emit({ chain, network, reason, status: 'no-runner' });
      return null;
    }

    const key = `${chain}:${network}`;
    const inflight = this._inFlight.get(key);
    if (inflight) {
      inflight.reasons.push(reason);
      return inflight.promise;
    }

    const reasons = [reason];
    const promise = (async () => {
      let result, error;
      try {
        result = await runner({ chain, network, reasons });
      } catch (e) {
        error = e;
      } finally {
        this._inFlight.delete(key);
      }
      this._emit({
        chain, network, reasons,
        status: error ? 'error' : 'ok',
        result, error,
      });
      if (error) throw error;
      return result;
    })();

    this._inFlight.set(key, { promise, reasons });
    return promise;
  }

  onResult(cb) {
    this._resultSubs.add(cb);
    return () => this._resultSubs.delete(cb);
  }

  inFlight(chain, network) {
    return this._inFlight.has(`${chain}:${network}`);
  }

  _emit(event) {
    for (const cb of this._resultSubs) {
      try { cb(event); } catch (e) { console.error('TriggerHub subscriber threw:', e); }
    }
  }
}

export const triggerHub = new TriggerHub();
