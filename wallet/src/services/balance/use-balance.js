/**
 * React bindings for BalanceService.
 *
 *   useBalance(assetKey, network)
 *     → { confirmed, pendingOut, pendingIn, inFlight, displayed, lastSyncedAt } | null
 *
 *   useInTransit({ chain?, network? })
 *     → PendingEntry[]
 *
 * Both hooks subscribe to the singleton balanceService and re-render on
 * any change affecting the queried asset (or the in-transit registry).
 * They call `loadFor(chain, network)` lazily on first mount per
 * (chain, network) — the call is idempotent so dozens of components
 * sharing the same network only hit storage once.
 */

import { useEffect, useState, useRef } from 'react';
import { balanceService } from './balance-service';
import { isValidAssetKey, parseAssetKey } from './asset-key';

const EMPTY_BALANCE = Object.freeze({
  confirmed: 0n, pendingOut: 0n, pendingIn: 0n, inFlight: 0n,
  displayed: 0n, lastSyncedAt: null,
});

export function useBalance(assetKey, network) {
  const [snapshot, setSnapshot] = useState(() => readSafe(assetKey, network));
  const lastReadRef = useRef({ assetKey, network });

  useEffect(() => {
    lastReadRef.current = { assetKey, network };
    if (!assetKey || !network || !isValidAssetKey(assetKey)) return;

    let mounted = true;
    const { chain } = parseAssetKey(assetKey);

    balanceService.loadFor(chain, network)
      .then(() => {
        if (!mounted) return;
        setSnapshot(readSafe(assetKey, network));
      })
      .catch(() => { /* silent — first paint will show EMPTY_BALANCE */ });

    const refresh = () => {
      if (!mounted) return;
      const cur = lastReadRef.current;
      if (cur.assetKey !== assetKey || cur.network !== network) return;
      setSnapshot(readSafe(assetKey, network));
    };
    const unsubKey = balanceService.subscribe(assetKey, refresh);
    const unsubAny = balanceService.subscribeInTransit(refresh);
    return () => { mounted = false; unsubKey(); unsubAny(); };
  }, [assetKey, network]);

  return snapshot;
}

export function useInTransit(filter = {}) {
  const { chain, network } = filter;
  const [list, setList] = useState(() => safeInTransit(filter));

  useEffect(() => {
    let mounted = true;
    setList(safeInTransit(filter));
    const refresh = () => { if (mounted) setList(safeInTransit(filter)); };
    const unsub = balanceService.subscribeInTransit(refresh);
    return () => { mounted = false; unsub(); };
  }, [chain, network]);

  return list;
}

function readSafe(assetKey, network) {
  if (!assetKey || !network || !isValidAssetKey(assetKey)) return EMPTY_BALANCE;
  try { return balanceService.getBalance(assetKey, network); }
  catch { return EMPTY_BALANCE; }
}

function safeInTransit(filter) {
  try { return balanceService.getInTransit(filter); }
  catch { return []; }
}
