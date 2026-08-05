/**
 * Activity screen — popup-sized transaction history.
 *
 * Reads from @/stores/transactionStore (the wallet's Zustand store) and
 * refreshes via @/services/wallet/sync/transactions-sync. No popup-local
 * fetch / classifier / cache anymore — same pipeline as the web wallet:
 *   1. indexer batch (transactions/batch) writes raw entries to
 *      `wallet:net:<bc>:<net>:transactions`
 *   2. reprocessCharmTransactions enriches with vin/vout + classifier
 *      labels (charm_received, beam_in, ebtc_redeem, …)
 *   3. this screen renders the labelled entries.
 *
 * Cardano variant uses @/services/cardano/api fetchAddressTxs +
 * tx-classifier directly; the cardanoStore doesn't sync history yet
 * (tracked as a follow-up).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAddresses } from '@/stores/addressesStore';
import { useNetwork } from '@/contexts/NetworkContext';
import { useBlockchain } from '@/stores/blockchainStore';
import { useTransactions } from '@/stores/transactionStore';
import { useCardano } from '@/stores/cardanoStore';
import {
  getTransactionLabel,
  getTransactionIcon,
  CHARM_TRANSACTION_TYPES,
} from '@/services/transactions/transaction-classifier';
import { fetchAddressTxs, getCardanoTxsBatch } from '@/services/cardano/api';
import { classifyCardanoTx, CARDANO_TX_ICON } from '@/services/cardano/tx-classifier';

// ── helpers ─────────────────────────────────────────────────────────────────

function formatDate(timestamp) {
  if (!timestamp) return 'Pending';
  const d = new Date(timestamp);
  const now = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const txDay = new Date(d); txDay.setHours(0, 0, 0, 0);
  const diff = Math.round((today - txDay) / 86400000);
  if (diff === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff}d ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function satsToBtc(sats) {
  return (Math.abs(sats) / 1e8).toFixed(8).replace(/\.?0+$/, '');
}

function mempoolUrl(txid, network) {
  return network === 'mainnet'
    ? `https://mempool.space/tx/${txid}`
    : `https://mempool.space/testnet4/tx/${txid}`;
}

// ── Bitcoin row ─────────────────────────────────────────────────────────────

function BtcTxRow({ tx, network }) {
  const incoming = tx.type === 'received' || tx.type === 'charm_received' ||
                   tx.type === 'beam_in' || tx.type === 'ebtc_redeem';
  const sign = incoming ? '+' : '-';
  const colour = incoming ? 'text-green-400' : 'text-red-400';
  const isCharm = CHARM_TRANSACTION_TYPES.has(tx.type);
  const label = getTransactionLabel(tx.type);
  const icon = getTransactionIcon(tx.type);

  // tx.charmTokenData carries the token amount + ticker when applicable
  const td = tx.charmTokenData;
  const amountStr = (() => {
    if (isCharm && td && Number(td.tokenAmount) > 0) {
      const amt = Number(td.tokenAmount);
      return `${sign}${amt.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${td.tokenTicker || ''}`;
    }
    if (tx.amount > 0) return `${sign}${satsToBtc(tx.amount)} BTC`;
    return '—';
  })();

  return (
    <a
      href={mempoolUrl(tx.txid, network)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-3 p-3 hover:bg-dark-800/50 transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg flex-shrink-0 ${
          incoming ? 'bg-green-500/20' : 'bg-red-500/20'
        }`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm text-white truncate">{label}</p>
          <p className="text-[10px] text-dark-500">
            {formatDate(tx.timestamp)} · {tx.status || 'pending'}
          </p>
        </div>
      </div>
      <span className={`text-sm font-mono ${colour} flex-shrink-0`}>{amountStr}</span>
    </a>
  );
}

// ── Cardano list ────────────────────────────────────────────────────────────

function CardanoActivity() {
  const addresses = useCardano(s => s.addresses);
  const [txs, setTxs] = useState([]);
  const [details, setDetails] = useState({});
  const [loading, setLoading] = useState(false);
  const ownAddrs = (addresses || []).map(a => a.address);
  const lastFetch = useRef(null);

  const reload = useCallback(async () => {
    if (!ownAddrs.length) return;
    setLoading(true);
    try {
      const list = await fetchAddressTxs(ownAddrs[0], 50);
      const sorted = (Array.isArray(list) ? list : []).sort((a, b) =>
        (b.block_height || 0) - (a.block_height || 0)
      );
      setTxs(sorted);
      const hashes = sorted.map(t => t.tx_hash || t.hash).filter(Boolean);
      if (hashes.length) {
        const detailMap = await getCardanoTxsBatch(hashes);
        setDetails(detailMap || {});
      }
    } catch (e) {
      console.error('[ActivityScreen.cardano] reload failed:', e?.message);
    } finally {
      setLoading(false);
    }
  }, [ownAddrs.join(',')]);

  useEffect(() => {
    if (lastFetch.current === ownAddrs[0]) return;
    lastFetch.current = ownAddrs[0];
    reload();
  }, [ownAddrs, reload]);

  if (!txs.length && !loading) {
    return (
      <div className="card p-6 text-center">
        <p className="text-sm text-dark-400">No Cardano transactions yet.</p>
      </div>
    );
  }

  return (
    <div className="card divide-y divide-dark-700/50">
      {loading && txs.length === 0 && (
        <div className="p-4 text-center text-xs text-dark-500">Loading…</div>
      )}
      {txs.map((tx) => {
        const hash = tx.tx_hash || tx.hash;
        const detail = details[hash];
        const cls = classifyCardanoTx(detail, ownAddrs);
        const icon = CARDANO_TX_ICON[cls.type] || 'TX';
        const colour = cls.direction === 'in' ? 'text-green-400'
                     : cls.direction === 'out' ? 'text-red-400' : 'text-dark-400';
        const sign = cls.direction === 'in' ? '+' : cls.direction === 'out' ? '−' : '';
        const amount = (() => {
          if (cls.amount == null) return '';
          if (cls.token) {
            const display = Number(cls.amount) / Math.pow(10, cls.token.decimals);
            return `${sign}${display.toFixed(cls.token.decimals).replace(/\.?0+$/, '')} ${cls.token.ticker}`;
          }
          return `${sign}${(Number(cls.amount) / 1_000_000).toFixed(6).replace(/\.?0+$/, '')} ADA`;
        })();
        return (
          <div key={hash} className="flex items-center justify-between gap-3 p-3 hover:bg-dark-800/50">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-cardano-500/15 flex items-center justify-center text-cardano-400 text-sm font-bold flex-shrink-0">
                {icon}
              </div>
              <div className="min-w-0">
                <p className="text-sm text-white truncate">{cls.label}</p>
                <p className="text-[10px] text-dark-500">Block {tx.block_height || '—'}</p>
              </div>
            </div>
            {amount && (
              <span className={`text-sm font-mono ${colour} flex-shrink-0`}>{amount}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export default function ActivityScreen({ onSyncStateChange }) {
  const { activeNetwork } = useNetwork();
  const { activeBlockchain, isCardano } = useBlockchain();
  const { addresses } = useAddresses();
  const { transactions, isLoading, loadTransactions } = useTransactions();
  const [refreshing, setRefreshing] = useState(false);
  const isCardanoChain = isCardano?.();

  // Load + refresh BTC tx history through the wallet's pipeline.
  const refresh = useCallback(async () => {
    if (isCardanoChain) return;
    setRefreshing(true);
    onSyncStateChange?.(true);
    try {
      const { syncTransactionHistory } = await import('@/services/wallet/sync/transactions-sync');
      await syncTransactionHistory({
        blockchain: activeBlockchain,
        network: activeNetwork,
        mode: 'incremental',
      });
      await loadTransactions(activeBlockchain, activeNetwork);
    } catch (e) {
      console.warn('[ActivityScreen] refresh failed:', e?.message);
    } finally {
      setRefreshing(false);
      onSyncStateChange?.(false);
    }
  }, [activeBlockchain, activeNetwork, isCardanoChain, loadTransactions, onSyncStateChange]);

  useEffect(() => {
    if (isCardanoChain) return;
    loadTransactions(activeBlockchain, activeNetwork);
  }, [activeBlockchain, activeNetwork, isCardanoChain, loadTransactions]);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold gradient-text">Activity</h2>
        {!isCardanoChain && (
          <button
            onClick={refresh}
            disabled={refreshing || isLoading}
            className="text-xs text-primary-400 hover:text-primary-300 disabled:opacity-50"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        )}
      </div>

      {isCardanoChain ? (
        <CardanoActivity />
      ) : transactions.length === 0 && !isLoading ? (
        <div className="card p-8 text-center">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-dark-400">No transactions yet</p>
          <p className="text-xs text-dark-500 mt-1">
            Send or receive BTC and the history will appear here.
          </p>
        </div>
      ) : (
        <div className="card divide-y divide-dark-700/50">
          {transactions.map((tx) => (
            <BtcTxRow key={tx.id || tx.txid} tx={tx} network={activeNetwork} />
          ))}
        </div>
      )}
    </div>
  );
}
