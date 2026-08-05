/**
 * Compact beam operations panel for the popup viewport.
 *
 * Source of state: @/contexts/BeamOperationsContext (the wallet's
 * Zustand-backed context). The desktop wallet renders a full vertical
 * step timeline (BeamPanel.js ~330 LOC); this is the popup equivalent
 * — one row per operation showing label, current phase, status, and
 * action buttons.
 *
 * E017 will move execution into the background service worker so beams
 * survive popup close. Until then, the user must keep the popup open
 * during long phases (BTC finality ~ 70 min). The compact panel doesn't
 * change that — it just makes status legible in 360px.
 */

import { useBeamOperations } from '@/contexts/BeamOperationsContext';
import { isActivePhase, PHASE_LABELS } from '@/services/beam/core/types';

function shortTxid(txid) {
  if (!txid) return '';
  return `${txid.slice(0, 8)}…${txid.slice(-6)}`;
}

function statusColour(op) {
  if (op.error) return 'text-red-400';
  if (op.btcTxid && op.adaClaimTxid) return 'text-green-400';
  if (isActivePhase(op.phase)) return 'text-blue-400';
  return 'text-dark-400';
}

function statusLabel(op) {
  if (op.error) return 'failed';
  if (op.btcTxid && op.adaClaimTxid) return 'done';
  return PHASE_LABELS?.[op.phase] || op.phase || 'pending';
}

function BeamRow({ op, onDismiss, onRetry }) {
  const colour = statusColour(op);
  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-white truncate">{op.label || 'Beam'}</p>
          <p className={`text-[10px] ${colour}`}>{statusLabel(op)}</p>
          {op.statusMessage && (
            <p className="text-[10px] text-dark-500 truncate">{op.statusMessage}</p>
          )}
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          {op.error && (
            <button
              onClick={() => onRetry?.(op.id)}
              className="text-[10px] px-2 py-0.5 rounded bg-primary-600/30 text-primary-200 hover:bg-primary-600/50"
            >
              Retry
            </button>
          )}
          {(op.btcTxid && op.adaClaimTxid) || op.error ? (
            <button
              onClick={() => onDismiss?.(op.id)}
              className="text-[10px] px-2 py-0.5 rounded bg-dark-700 text-dark-300 hover:bg-dark-600"
            >
              Dismiss
            </button>
          ) : null}
        </div>
      </div>

      {(op.btcTxid || op.adaClaimTxid) && (
        <div className="flex flex-wrap gap-2 text-[10px] text-dark-400">
          {op.btcTxid && (
            <a
              href={`https://mempool.space/tx/${op.btcTxid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-bitcoin-400 hover:underline"
            >
              BTC {shortTxid(op.btcTxid)}
            </a>
          )}
          {op.adaClaimTxid && (
            <a
              href={`https://cardanoscan.io/transaction/${op.adaClaimTxid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-cardano-400 hover:underline"
            >
              ADA {shortTxid(op.adaClaimTxid)}
            </a>
          )}
        </div>
      )}

      {op.error && (
        <p className="text-[10px] text-red-400/80 break-words">{op.error}</p>
      )}
    </div>
  );
}

export default function BeamPanelPopup() {
  const { state, dismissBeam, retryBeam } = useBeamOperations();
  const ops = state?.operations || [];

  if (!ops.length) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-dark-300 uppercase tracking-wider">
        Beam operations
      </h3>
      <div className="space-y-2">
        {ops.map((op) => (
          <BeamRow
            key={op.id}
            op={op}
            onDismiss={dismissBeam}
            onRetry={retryBeam}
          />
        ))}
      </div>
    </div>
  );
}
