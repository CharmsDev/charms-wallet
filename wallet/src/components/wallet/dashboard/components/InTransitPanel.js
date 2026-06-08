'use client';

/**
 * InTransitPanel — single source of "what's in flight".
 *
 * Subscribes to the BalanceService via `useInTransit` and renders one row
 * per live PendingEntry. Replaces the scattered "+X pending" badges that
 * used to live in BalanceDisplay, CardanoDashboard, BeamPanel, etc.
 *
 * Each row shows: label, asset, amount, state. Cross-chain ops (xchain-out
 * / xchain-in) are paired by `relatedOpId` so the panel renders them as a
 * single "Beam BTC → ADA" entry instead of two rows.
 */

import { useInTransit, parseAssetKey, PENDING_STATE } from '@/services/balance';

const STATE_LABEL = {
  [PENDING_STATE.CREATED]:   'Preparing',
  [PENDING_STATE.BROADCAST]: 'Broadcast',
  [PENDING_STATE.MEMPOOL]:   'In mempool',
  [PENDING_STATE.IN_BLOCK]:  'In block',
};

const KIND_LABEL = {
  outgoing:    '↗ outgoing',
  incoming:    '↙ incoming',
  'xchain-out': '⇄ cross-chain out',
  'xchain-in':  '⇄ cross-chain in',
};

function formatAmount(entry) {
  // Display raw base-unit amount; per-asset formatting (sats→BTC,
  // lovelace→ADA, decimals→token) is a follow-up — see T-09 in
  // .meshkore/modules/wallet/tasks/W004-balance-service-followups.md.
  const n = entry.amount;
  return n;
}

function shortKey(assetKey) {
  try {
    const { chain, kind, ref } = parseAssetKey(assetKey);
    if (kind === 'native') return ref;
    if (kind === 'charm')  return `charm:${ref.slice(0, 10)}…`;
    if (kind === 'cnt')    return `cnt:${ref.slice(0, 12)}…`;
    return assetKey;
  } catch { return assetKey; }
}

export default function InTransitPanel() {
  const entries = useInTransit();

  // Pair xchain-out + xchain-in by relatedOpId so the user sees one row
  // per cross-chain operation. Same-asset incoming-change entries also
  // group under their parent (relatedOpId) so the row reads as a net move.
  const grouped = [];
  const seen = new Set();
  for (const e of entries) {
    if (seen.has(e.opId)) continue;
    if (e.relatedOpId && seen.has(e.relatedOpId)) continue;
    const partner = e.relatedOpId
      ? entries.find(o => o.opId === e.relatedOpId && o.opId !== e.opId)
      : null;
    grouped.push({ primary: e, partner: partner || null });
    seen.add(e.opId);
    if (partner) seen.add(partner.opId);
  }

  if (grouped.length === 0) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-semibold gradient-text mb-2">In Transit</h3>
        <p className="text-sm text-dark-400">No transactions in flight.</p>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold gradient-text mb-4">In Transit ({grouped.length})</h3>
      <div className="space-y-3">
        {grouped.map(({ primary, partner }) => (
          <div key={primary.opId} className="glass-effect p-3 rounded-lg">
            <div className="flex justify-between items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{primary.label || primary.opId}</p>
                <p className="text-xs text-dark-400 mt-0.5">
                  {KIND_LABEL[primary.kind] || primary.kind} · {shortKey(primary.assetKey)}
                </p>
                {partner && (
                  <p className="text-xs text-dark-400 mt-0.5">
                    {KIND_LABEL[partner.kind] || partner.kind} · {shortKey(partner.assetKey)}
                  </p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-mono text-sm text-white">{formatAmount(primary)}</p>
                <p className="text-xs text-orange-400 mt-0.5">
                  {STATE_LABEL[primary.state] || primary.state}
                </p>
              </div>
            </div>
            {primary.txid && (
              <p className="font-mono text-[10px] text-dark-500 mt-2 truncate" title={primary.txid}>
                tx: {primary.txid}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
