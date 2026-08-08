/**
 * InTransitList — popup-sized equivalent of the wallet's InTransitPanel.
 *
 * Same source of truth (useInTransit over the BalanceService) and the same
 * pairing rule: an entry carrying relatedOpId groups under its parent so a
 * send plus its change reads as one row rather than two. Trimmed to fit a
 * 360px popup, and renders nothing at all when nothing is in flight, since
 * the popup has no room for an empty-state card.
 */

import { useEffect } from 'react';
import { useInTransit, parseAssetKey, PENDING_STATE, balanceService } from '@/services/balance';
import { useBlockchain } from '@/stores/blockchainStore';

const STATE_LABEL = {
  [PENDING_STATE.CREATED]:   'Preparing',
  [PENDING_STATE.BROADCAST]: 'Broadcast',
  [PENDING_STATE.MEMPOOL]:   'In mempool',
  [PENDING_STATE.IN_BLOCK]:  'In block',
};

function shortKey(assetKey) {
  try {
    const { kind, ref } = parseAssetKey(assetKey);
    if (kind === 'native') return ref;
    if (kind === 'charm')  return `charm ${ref.slice(0, 6)}…`;
    if (kind === 'cnt')    return `cnt ${ref.slice(0, 8)}…`;
    return assetKey;
  } catch { return assetKey; }
}

export default function InTransitList() {
  const { activeNetwork } = useBlockchain();
  const entries = useInTransit();

  // useInTransit subscribes but does not hydrate — only useBalance does.
  // Without this the popup would render an empty list until some other
  // code happened to load the repo. Idempotent.
  useEffect(() => {
    if (!activeNetwork) return;
    balanceService.loadFor('bitcoin', activeNetwork).catch(() => {});
  }, [activeNetwork]);

  const rows = [];
  const seen = new Set();
  for (const e of entries) {
    if (seen.has(e.opId)) continue;
    // Child entries (change, self) fold into the parent row.
    if (e.relatedOpId && entries.some(o => o.opId === e.relatedOpId)) {
      seen.add(e.opId);
      continue;
    }
    rows.push(e);
    seen.add(e.opId);
  }

  if (rows.length === 0) return null;

  return (
    <div className="mt-3">
      <div className="text-xs text-dark-400 mb-1.5">In progress</div>
      <div className="space-y-1.5">
        {rows.map((e) => (
          <div key={e.opId} className="card p-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-medium text-white truncate">
                {e.label || 'Operation'}
              </div>
              <div className="text-[10px] text-dark-500 truncate">
                {shortKey(e.assetKey)} · {STATE_LABEL[e.state] || e.state}
              </div>
            </div>
            <div className="text-xs font-semibold text-orange-400 flex-shrink-0">
              {e.kind === 'incoming' ? '+' : '−'}{String(e.amount)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
