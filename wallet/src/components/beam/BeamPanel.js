'use client';

/**
 * Beam Operations Panel — vertical step tracker.
 *
 * Shows all beam phases as a vertical timeline:
 * - Completed steps: checkmark + txid link
 * - Active step: spinner + live message
 * - Pending steps: dimmed
 */

import React, { useEffect, useState } from 'react';
import { useBeamOperations } from '@/contexts/BeamOperationsContext';
import { BEAM_PHASE, PHASE_LABELS, isActivePhase } from '@/services/beam/core/types';
import './BeamPanel.css';

// ── Step definitions per direction ─────────────────────────────────────────

const STEPS_BTC_TO_ADA = [
  { phase: BEAM_PHASE.CREATING_PLACEHOLDER, label: 'Create Cardano placeholder', icon: '1', chain: 'cardano' },
  { phase: BEAM_PHASE.WAITING_DEST_CONFIRM, label: 'Cardano confirmation', icon: '2', chain: 'cardano' },
  { phase: BEAM_PHASE.BUILDING_SPELL,       label: 'Build beam spell', icon: '3' },
  { phase: BEAM_PHASE.PROVING,              label: 'Generate ZK proof', icon: '4' },
  { phase: BEAM_PHASE.SIGNING_SOURCE,       label: 'Sign Bitcoin transaction', icon: '5', chain: 'bitcoin' },
  { phase: BEAM_PHASE.BROADCASTING_SOURCE,  label: 'Broadcast to Bitcoin', icon: '6', chain: 'bitcoin' },
  { phase: BEAM_PHASE.WAITING_FINALITY,     label: 'Bitcoin finality (6 blocks)', icon: '7', chain: 'bitcoin' },
  { phase: BEAM_PHASE.CLAIMING_DEST,        label: 'Claim on Cardano', icon: '8', chain: 'cardano' },
];

const STEPS_ADA_TO_BTC = [
  { phase: BEAM_PHASE.CREATING_PLACEHOLDER, label: 'Create Bitcoin placeholder', icon: '1', chain: 'bitcoin' },
  { phase: BEAM_PHASE.WAITING_DEST_CONFIRM, label: 'Bitcoin placeholder in mempool', icon: '2', chain: 'bitcoin' },
  { phase: BEAM_PHASE.BUILDING_SPELL,       label: 'Build Cardano beam-out', icon: '3', chain: 'cardano' },
  { phase: BEAM_PHASE.PROVING,              label: 'Prove + sign Cardano tx', icon: '4', chain: 'cardano' },
  { phase: BEAM_PHASE.WAITING_FINALITY,     label: 'Cardano finality', icon: '5', chain: 'cardano' },
  { phase: BEAM_PHASE.CLAIMING_DEST,        label: 'Claim on Bitcoin', icon: '6', chain: 'bitcoin' },
];

const STEPS_EBTC = [
  { phase: BEAM_PHASE.CREATING_PLACEHOLDER, label: 'Cardano placeholder', icon: '1', chain: 'cardano' },
  { phase: BEAM_PHASE.PROVING,              label: 'Bitcoin transaction', icon: '2', chain: 'bitcoin' },
  { phase: BEAM_PHASE.WAITING_FINALITY,     label: 'Bitcoin finality (6 blocks)', icon: '3', chain: 'bitcoin' },
  { phase: BEAM_PHASE.CLAIMING_DEST,        label: 'Claim on Cardano', icon: '4', chain: 'cardano' },
];

const STEPS_EBTC_REDEEM = [
  { phase: BEAM_PHASE.CREATING_PLACEHOLDER, label: 'Bitcoin placeholder', icon: '1', chain: 'bitcoin' },
  { phase: BEAM_PHASE.PROVING,              label: 'Cardano transaction', icon: '2', chain: 'cardano' },
  { phase: BEAM_PHASE.WAITING_FINALITY,     label: 'Cardano finality', icon: '3', chain: 'cardano' },
  { phase: BEAM_PHASE.CLAIMING_DEST,        label: 'Bitcoin transaction', icon: '4', chain: 'bitcoin' },
];

function getStepsForOp(op) {
  const direction = op?.payload?.direction || op?.direction;
  const hasLockSats = !!op?.payload?.lockSats;
  const hasRedeemAmount = !!op?.payload?.redeemAmount;
  if (direction === 'ebtc-ada-to-btc' || hasRedeemAmount || op?.label?.startsWith('Redeem')) return STEPS_EBTC_REDEEM;
  if (direction === 'ada-to-btc' || op?.label?.includes('→ Bitcoin')) return STEPS_ADA_TO_BTC;
  if (direction === 'ebtc-btc-to-ada' || hasLockSats || op?.label?.includes('eBTC') || op?.label?.includes('sats →')) return STEPS_EBTC;
  return STEPS_BTC_TO_ADA;
}

function getStepIndex(phase, steps) {
  return steps.findIndex(s => s.phase === phase);
}

// ── Elapsed Timer ───────────────────────────────────────────────────────────

function ElapsedTimer({ startedAt }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [startedAt]);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return <span className="beam-elapsed">{mins}:{secs.toString().padStart(2, '0')}</span>;
}

// ── Step Row ────────────────────────────────────────────────────────────────

function StepRow({ step, stepData, isActive, isCompleted, isPending, isFailed, errorMsg, txid }) {
  const message = stepData?.message || '';

  // Extract txid from message if not provided directly
  if (!txid) {
    const txidMatch = message.match(/(?:tx broadcast|txid)[:\s]+([a-f0-9]{8,64})/i);
    txid = txidMatch?.[1];
  }

  // Default to mainnet — beam ops are production usage; preprod links can be
  // wired through op.network later if needed.
  const explorerBase = step.chain === 'cardano'
    ? 'https://adastat.net/transactions/'
    : 'https://mempool.space/tx/';

  return (
    <div className={`beam-step ${isActive ? 'beam-step--active' : ''} ${isCompleted ? 'beam-step--done' : ''} ${isPending ? 'beam-step--pending' : ''} ${isFailed ? 'beam-step--failed' : ''}`}
         style={isFailed ? { borderLeft: '2px solid #ef4444', paddingLeft: '0.5rem' } : undefined}>
      <div className="beam-step-icon">
        {isCompleted && <span className="beam-step-check">&#10003;</span>}
        {isActive && <div className="beam-spinner-sm" />}
        {isPending && !isFailed && <span className="beam-step-num">{step.icon}</span>}
        {isFailed && <span style={{ color: '#ef4444', fontSize: '1rem' }}>&#10007;</span>}
      </div>

      <div className="beam-step-content">
        <div className="beam-step-label" style={isFailed ? { color: '#ef4444' } : undefined}>{step.label}</div>
        {isActive && message && (
          <div className="beam-step-message">{message}</div>
        )}
        {isFailed && errorMsg && (
          <div style={{ color: '#ef4444', fontSize: '0.7rem', marginTop: '0.25rem', lineHeight: 1.4, wordBreak: 'break-word' }}>{errorMsg}</div>
        )}
        {isCompleted && txid && (
          <a className="beam-step-txid" href={`${explorerBase}${txid}`} target="_blank" rel="noopener noreferrer" style={{ wordBreak: 'break-all', fontSize: '0.65rem' }}>
            {txid}
          </a>
        )}
      </div>

      {isActive && stepData?.startedAt && (
        <ElapsedTimer startedAt={stepData.startedAt} />
      )}
    </div>
  );
}

// ── Operation Card ──────────────────────────────────────────────────────────

function BeamOperationCard({ op }) {
  const { dismissBeam, retryBeam } = useBeamOperations();
  const steps = getStepsForOp(op);
  const isComplete = op.phase === BEAM_PHASE.COMPLETE;
  const isError = op.phase === BEAM_PHASE.ERROR;
  // In error state, highlight the phase that failed (saved when ERROR was dispatched)
  const activePhase = isError ? op.failedPhase : op.phase;
  const currentIndex = getStepIndex(activePhase, steps);
  const failedIndex = isError ? currentIndex : -1;
  const direction = op?.payload?.direction || op?.direction;
  const isRedeem = direction === 'ebtc-ada-to-btc' || op?.label?.startsWith('Redeem');
  const badgeLabel = isRedeem ? 'REDEEM' : 'BEAM';

  return (
    <div className={`beam-card ${isComplete ? 'beam-card--complete' : ''} ${isError ? 'beam-card--error' : ''}`}>
      {/* Header */}
      <div className="beam-card-header">
        <div>
          <span className="beam-badge">{badgeLabel}</span>
          <span className="beam-card-label">{op.label}</span>
        </div>
        {op.startedAt && <ElapsedTimer startedAt={op.startedAt} />}
      </div>

      {/* Interrupted notice */}
      {op.interrupted && (
        <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-3 mb-3 text-xs text-amber-300">
          <div className="mb-2">
            Beam interrupted at: <strong>{op.phase}</strong>.
            {op.btcTxid && <> BTC tx: <code className="text-amber-200">{op.btcTxid.slice(0, 16)}...</code></>}
          </div>
          <button
            onClick={() => dismissBeam(op.id)}
            className="w-full py-1.5 rounded-md bg-amber-800/40 border border-amber-600/40 text-amber-200 text-xs font-medium hover:bg-amber-700/50 transition-colors"
          >
            Discard
          </button>
        </div>
      )}

      {/* Vertical steps — shown also in error state, with failed step highlighted red */}
      {!isComplete && !op.interrupted && (
        <div className="beam-steps">
          {steps.map((step, i) => {
            const stepData = (op.steps || []).find(s => s.phase === step.phase);
            const isFailed = isError && i === failedIndex;
            const isActive = !isError && i === currentIndex;
            const isCompleted = i < currentIndex || (stepData && stepData.completedAt && i !== failedIndex);
            const isPending = i > currentIndex;
            // Map txids from operation data to the right step. Placeholder
            // txid is unified across all flows (`placeholderTxid`); other
            // fields differ per direction because they represent different
            // transactions.
            const payload = op.payload || {};
            const direction = payload.direction || op.direction;
            const isAdaToBtc = direction === 'ada-to-btc' || op?.label?.includes('→ Bitcoin');
            let txid = null;
            if (step.phase === BEAM_PHASE.CREATING_PLACEHOLDER) {
              txid = payload.placeholderTxid;
            } else if (isRedeem) {
              if (step.phase === BEAM_PHASE.PROVING) txid = payload.cardanoBeamOutTxHash;
              if (step.phase === BEAM_PHASE.CLAIMING_DEST) txid = payload.btcRedeemTxid || op.btcTxid;
            } else if (isAdaToBtc) {
              if (step.phase === BEAM_PHASE.PROVING) txid = payload.cardanoBeamOutTxHash;
              if (step.phase === BEAM_PHASE.CLAIMING_DEST) txid = op.btcTxid || payload.btcClaimTxid;
            } else {
              if (step.phase === BEAM_PHASE.PROVING) txid = op.btcTxid || payload.btcTxid;
              if (step.phase === BEAM_PHASE.CLAIMING_DEST) txid = op.adaClaimTxid || payload.adaClaimTxid;
            }
            return (
              <StepRow
                key={step.phase}
                step={step}
                stepData={stepData}
                isActive={isActive}
                isCompleted={isCompleted}
                isPending={isPending && !isFailed}
                isFailed={isFailed}
                errorMsg={isFailed ? op.error : null}
                txid={isCompleted ? txid : null}
              />
            );
          })}
        </div>
      )}

      {/* Complete state */}
      {isComplete && (
        <div className="beam-complete-box">
          <div className="beam-complete-icon-lg">&#10003;</div>
          <div className="beam-complete-text">Beam complete!</div>
          <div className="beam-tx-links-col">
            {op.btcTxid && (
              <a className="beam-txid-link" href={`https://mempool.space/tx/${op.btcTxid}`} target="_blank" rel="noopener noreferrer">
                BTC: {op.btcTxid.slice(0, 12)}...
              </a>
            )}
            {op.adaClaimTxid && (
              <a className="beam-txid-link" href={`https://adastat.net/transactions/${op.adaClaimTxid}`} target="_blank" rel="noopener noreferrer">
                ADA: {op.adaClaimTxid.slice(0, 12)}...
              </a>
            )}
          </div>
        </div>
      )}

      {/* Error hints (error text already appears inline on the failed step) */}
      {isError && (op.errorCode === 'INSUFFICIENT_FUNDS' || op.errorCode === 'MITHRIL_TIMEOUT' || op.errorCode === 'BTC_MEMPOOL_TIMEOUT' || op.errorCode === 'PLACEHOLDER_SPENT') && (
        <div className="beam-error-box" style={{ marginTop: '0.5rem' }}>
          {op.errorCode === 'INSUFFICIENT_FUNDS' && (
            <div style={{ fontSize: '0.7rem', color: '#fbbf24', lineHeight: 1.4 }}>
              Add BTC to your wallet, then click <strong>Retry</strong>. The process resumes from where it stopped — nothing is lost on-chain.
            </div>
          )}
          {(op.errorCode === 'MITHRIL_TIMEOUT' || op.errorCode === 'BTC_MEMPOOL_TIMEOUT') && (
            <div style={{ fontSize: '0.7rem', color: '#60a5fa', lineHeight: 1.4 }}>
              This is a network-wait timeout, not a failure. All prior steps are safely on-chain. Click <strong>Retry</strong> to keep waiting.
            </div>
          )}
          {op.errorCode === 'PLACEHOLDER_SPENT' && (
            <div style={{ fontSize: '0.7rem', color: '#f87171', lineHeight: 1.4 }}>
              The BTC placeholder UTXO was spent externally, breaking the commitment to the Cardano beam-out. This redeem cannot be recovered. Please contact support.
            </div>
          )}
        </div>
      )}

      {/* Retry (for errors where retry makes sense) + Dismiss */}
      {isError && op.errorCode !== 'PLACEHOLDER_SPENT' && (
        <button
          onClick={() => retryBeam(op.id)}
          style={{
            width: '100%', padding: '0.5rem', borderRadius: '0.375rem',
            background: 'linear-gradient(to right, #9333ea, #6366f1)',
            color: 'white', fontSize: '0.75rem', fontWeight: 500,
            marginTop: '0.5rem', border: 'none', cursor: 'pointer',
          }}
        >
          Retry
        </button>
      )}
      {(isComplete || isError) && (
        <button className="beam-btn-dismiss-card" onClick={() => dismissBeam(op.id)}>
          Dismiss
        </button>
      )}
    </div>
  );
}

// ── Main Panel ──────────────────────────────────────────────────────────────

const AUTO_DISMISS_MS = 20 * 60 * 1000;

export default function BeamPanel() {
  const { operations, isPanelOpen, closePanel, dismissBeam } = useBeamOperations();

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      for (const op of operations) {
        // Only auto-dismiss COMPLETE ops, never ERROR (so user can retry)
        if (op.phase === BEAM_PHASE.COMPLETE && op.completedAt) {
          if (now - op.completedAt > AUTO_DISMISS_MS) dismissBeam(op.id);
        }
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [operations, dismissBeam]);

  if (!isPanelOpen) return null;

  return (
    <div className="beam-overlay" onClick={closePanel}>
      <div className="beam-modal" onClick={e => e.stopPropagation()}>
        <div className="beam-modal-header">
          <span className="beam-modal-title">Beam Operations</span>
          <div className="flex items-center gap-2">
            {operations.filter(op => op.interrupted || op.phase === BEAM_PHASE.ERROR || op.phase === BEAM_PHASE.COMPLETE).length > 1 && (
              <button
                className="beam-modal-minimize"
                style={{ color: '#f59e0b', borderColor: 'rgba(245,158,11,0.3)' }}
                onClick={() => {
                  const toClear = operations.filter(op => op.interrupted || op.phase === BEAM_PHASE.ERROR || op.phase === BEAM_PHASE.COMPLETE);
                  toClear.forEach(op => dismissBeam(op.id));
                }}
              >
                Clear All
              </button>
            )}
            <button className="beam-modal-minimize" onClick={closePanel}>Minimize</button>
          </div>
        </div>

        <div className="beam-modal-body">
          {operations.map(op => (
            <BeamOperationCard key={op.id} op={op} />
          ))}

          {operations.length === 0 && (
            <div className="beam-empty">No beam operations</div>
          )}
        </div>
      </div>
    </div>
  );
}
