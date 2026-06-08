'use client';

/**
 * Cardano Send Dialog — one component, two modes:
 *   - mode="ada"  → native ADA transfer
 *   - mode="cnt"  → native token (CNT) transfer, asset prop required
 *
 * Shared form, recipient validation, submit + status + tx link. Keeps the
 * surface area small: one modal, one confirm step, one success view.
 */

import { useState, useEffect, useMemo } from 'react';
import { useWallet } from '@/stores/walletStore';
import { useCardano } from '@/stores/cardanoStore';
import { useTransactions } from '@/stores/transactionStore';
import { sendAda } from '@/services/cardano/send';
import { sendCnt } from '@/services/cardano/send-cnt';
import { cardanoTxUrl } from '@/utils/cardanoExplorer';

export default function CardanoSendDialog({ isOpen, onClose, mode = 'ada', asset = null }) {
  const { seedPhrase } = useWallet();
  const { addresses, adaBalance, currentNetwork, refresh } = useCardano();
  const { loadTransactions } = useTransactions();

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState(null);        // info line during submit
  const [error, setError] = useState(null);
  const [txHash, setTxHash] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const network = currentNetwork?.replace('cardano-', '') || 'mainnet';
  const fromAddress = addresses?.[0]?.address || '';
  const addressIndex = addresses?.[0]?.index ?? 0;

  // Reset state on open/close
  useEffect(() => {
    if (!isOpen) {
      setRecipient(''); setAmount(''); setStatus(null);
      setError(null); setTxHash(null); setIsSubmitting(false);
    }
  }, [isOpen]);

  // Display balance depends on mode
  const balanceInfo = useMemo(() => {
    if (mode === 'ada') {
      const ada = Number(BigInt(adaBalance || '0')) / 1_000_000;
      return { label: 'ADA', display: ada.toLocaleString(undefined, { maximumFractionDigits: 6 }) };
    }
    const decimals = asset?.decimals ?? 0;
    const qty = Number(BigInt(asset?.quantity || '0')) / Math.pow(10, decimals);
    return { label: asset?.ticker || asset?.name || 'tokens', display: qty.toLocaleString(undefined, { maximumFractionDigits: decimals }) };
  }, [mode, adaBalance, asset]);

  const title = mode === 'ada' ? 'Send ADA' : `Send ${asset?.ticker || asset?.name || 'Token'}`;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!recipient || !amount) { setError('Fill in both fields'); return; }

    setIsSubmitting(true);
    try {
      let result;
      if (mode === 'ada') {
        const lovelace = BigInt(Math.round(parseFloat(amount) * 1_000_000));
        result = await sendAda({
          fromAddress, toAddress: recipient.trim(), lovelace,
          seedPhrase, addressIndex, network, onStatus: setStatus,
        });
      } else {
        const decimals = asset?.decimals ?? 0;
        const rawQty = BigInt(Math.round(parseFloat(amount) * Math.pow(10, decimals)));
        result = await sendCnt({
          fromAddress, toAddress: recipient.trim(),
          policyId: asset.policyId, assetName: asset.assetName, quantity: rawQty,
          seedPhrase, addressIndex, network, onStatus: setStatus,
        });
      }
      setTxHash(result.txHash);
      setStatus(null);

      // sendAda / sendCnt already registered the outgoing + change with
      // the BalanceService; the dashboard will reflect "+X confirming"
      // automatically via useBalance(ADA_KEY|cntKey, network).pendingIn.

      // Refresh downstream state so the UI catches up (balance + history).
      refresh?.().catch(() => {});
      loadTransactions?.('cardano', network).catch(() => {});
    } catch (err) {
      setError(err?.message || String(err));
      setStatus(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
      <div className="bg-dark-900 rounded-lg p-6 w-full max-w-lg mx-4 border border-white/20">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold gradient-text">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {txHash ? (
          <SuccessView
            txHash={txHash}
            network={network}
            recipient={recipient.trim()}
            amount={amount}
            unit={balanceInfo.label}
            onClose={onClose}
          />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="text-xs text-dark-400">
              Balance: <span className="text-white font-mono">{balanceInfo.display} {balanceInfo.label}</span>
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">Recipient address</label>
              <input
                type="text"
                value={recipient}
                onChange={e => setRecipient(e.target.value)}
                placeholder="addr1..."
                className="w-full bg-dark-800 border border-dark-600 rounded px-3 py-2 text-sm font-mono"
                disabled={isSubmitting}
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">Amount ({balanceInfo.label})</label>
              <input
                type="number"
                step="any"
                min="0"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.0"
                className="w-full bg-dark-800 border border-dark-600 rounded px-3 py-2 text-sm font-mono"
                disabled={isSubmitting}
              />
              {mode === 'cnt' && (
                <p className="text-xs text-dark-400 mt-1">
                  Recipient will receive ~1.5 ADA alongside the tokens (Cardano protocol minimum).
                </p>
              )}
            </div>

            {status && <div className="text-xs text-blue-400">{status}</div>}
            {error && <div className="text-xs text-red-400 break-words">{error}</div>}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 bg-dark-700 hover:bg-dark-600 text-white py-2 rounded disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !recipient || !amount}
                className="flex-1 btn-primary disabled:opacity-50"
              >
                {isSubmitting ? 'Sending...' : 'Send'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function SuccessView({ txHash, network, recipient, amount, unit, onClose }) {
  const truncAddr = recipient && recipient.length > 24
    ? `${recipient.slice(0, 12)}…${recipient.slice(-8)}`
    : recipient;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-green-400 font-semibold">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span>Transaction submitted</span>
      </div>

      {/* Amount headline */}
      <div className="glass-effect rounded-lg p-4 text-center">
        <div className="text-xs text-dark-400 mb-1">Amount sent</div>
        <div className="text-2xl font-bold text-white">
          {amount} <span className="text-lg text-dark-400">{unit}</span>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between items-start gap-3">
          <span className="text-dark-400 flex-shrink-0">To</span>
          <span className="font-mono text-xs text-white break-all text-right" title={recipient}>{truncAddr}</span>
        </div>
        <div className="flex justify-between items-start gap-3">
          <span className="text-dark-400 flex-shrink-0">Transaction</span>
          <span className="font-mono text-xs text-white break-all text-right">{txHash}</span>
        </div>
      </div>

      <p className="text-xs text-dark-400">
        The transaction is in the mempool. Balance and history will update after the next refresh.
      </p>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <a
          href={cardanoTxUrl(txHash, network)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 bg-dark-700 hover:bg-dark-600 text-white py-2 px-4 rounded text-sm text-center transition-colors"
        >
          View on explorer →
        </a>
        <button
          onClick={onClose}
          className="flex-1 btn-primary py-2 px-4 text-sm"
        >
          Close
        </button>
      </div>
    </div>
  );
}
