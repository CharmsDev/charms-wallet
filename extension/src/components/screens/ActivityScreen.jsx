import { useState, useEffect, useCallback } from 'react';
import { useAddresses } from '@/stores/addressesStore';
import { useNetwork } from '@/contexts/NetworkContext';
import { explorerWalletService } from '@/services/shared/explorer-wallet-service';

const PAGE_SIZE = 50;

function formatDate(blockTime) {
  if (!blockTime) return 'Pending';
  const d = new Date(blockTime * 1000);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function satsToBtc(sats) {
  return (Math.abs(sats) / 1e8).toFixed(8).replace(/\.?0+$/, '');
}

function getMempoolTxUrl(txid, network) {
  return network === 'mainnet'
    ? `https://mempool.space/tx/${txid}`
    : `https://mempool.space/testnet4/tx/${txid}`;
}

function ConfirmationBadge({ confirmations }) {
  if (confirmations === 0) {
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">Unconfirmed</span>;
  }
  if (confirmations < 3) {
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">{confirmations} conf</span>;
  }
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">{confirmations}+ conf</span>;
}

function TransactionRow({ tx, network }) {
  const isReceived = tx.direction === 'in';
  const mempoolUrl = getMempoolTxUrl(tx.txid, network);

  return (
    <a
      href={mempoolUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 px-3 py-3 hover:bg-dark-800/50 rounded-lg transition-colors cursor-pointer"
    >
      {/* Direction icon */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
        isReceived ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
      }`}>
        {isReceived ? '↓' : '↑'}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-dark-200">{isReceived ? 'Received' : 'Sent'}</span>
          <ConfirmationBadge confirmations={tx.confirmations} />
        </div>
        <div className="text-xs text-dark-500 mt-0.5 truncate">{tx.txid}</div>
      </div>

      {/* Amount + Date */}
      <div className="text-right flex-shrink-0">
        <div className={`text-sm font-medium ${isReceived ? 'text-green-400' : 'text-red-400'}`}>
          {isReceived ? '+' : '-'}{satsToBtc(tx.amount)} BTC
        </div>
        <div className="text-xs text-dark-500 mt-0.5">{formatDate(tx.block_time)}</div>
      </div>
    </a>
  );
}

function SkeletonRows() {
  return Array.from({ length: 4 }).map((_, i) => (
    <div key={i} className="flex items-center gap-3 px-3 py-3 animate-pulse">
      <div className="w-8 h-8 rounded-full bg-dark-700" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-dark-700 rounded w-24" />
        <div className="h-2 bg-dark-700 rounded w-40" />
      </div>
      <div className="space-y-2 text-right">
        <div className="h-3 bg-dark-700 rounded w-20 ml-auto" />
        <div className="h-2 bg-dark-700 rounded w-14 ml-auto" />
      </div>
    </div>
  ));
}

export default function ActivityScreen() {
  const { addresses } = useAddresses();
  const { activeNetwork } = useNetwork();

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const fetchTransactions = useCallback(async (pageNum = 1, append = false) => {
    if (!addresses || addresses.length === 0) {
      setLoading(false);
      return;
    }

    try {
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      // Only use non-change addresses to avoid duplicate transactions
      const receiveAddresses = addresses.filter(a => !a.isChange).map(a => a.address);

      // Fetch history for all addresses in parallel
      const results = await Promise.allSettled(
        receiveAddresses.map(addr =>
          explorerWalletService.getTransactionHistory(addr, activeNetwork, { page: pageNum, pageSize: PAGE_SIZE })
        )
      );

      // Merge and deduplicate by txid
      const seen = new Set();
      const merged = [];
      let anyHasMore = false;

      for (const r of results) {
        if (r.status !== 'fulfilled' || !r.value?.transactions) continue;
        const data = r.value;
        if (data.page < data.total_pages) anyHasMore = true;
        for (const tx of data.transactions) {
          if (!seen.has(tx.txid)) {
            seen.add(tx.txid);
            merged.push(tx);
          }
        }
      }

      // Sort: pending first, then by block_time descending
      merged.sort((a, b) => {
        if (!a.block_time && b.block_time) return -1;
        if (a.block_time && !b.block_time) return 1;
        return (b.block_time || 0) - (a.block_time || 0);
      });

      if (append) {
        setTransactions(prev => {
          const existingIds = new Set(prev.map(t => t.txid));
          const newTxs = merged.filter(t => !existingIds.has(t.txid));
          return [...prev, ...newTxs];
        });
      } else {
        setTransactions(merged);
      }
      setHasMore(anyHasMore);
    } catch (err) {
      console.error('[ActivityScreen] Error fetching transactions:', err);
      setError(err.message || 'Failed to fetch transactions');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [addresses, activeNetwork]);

  // Reset and fetch when network changes
  useEffect(() => {
    setTransactions([]);
    setPage(1);
    setHasMore(false);
    fetchTransactions(1, false);
  }, [activeNetwork, fetchTransactions]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchTransactions(nextPage, true);
  };

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold gradient-text mb-4">Activity</h2>

      {/* Loading state */}
      {loading && (
        <div className="card">
          <SkeletonRows />
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="card p-4">
          <div className="text-red-400 text-sm mb-2">Failed to load transactions</div>
          <div className="text-xs text-dark-500 mb-3">{error}</div>
          <button
            onClick={() => fetchTransactions(1, false)}
            className="btn btn-secondary text-xs px-3 py-1.5"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && transactions.length === 0 && (
        <div className="card p-8 text-center">
          <div className="text-4xl mb-3">📋</div>
          <div className="text-dark-400">No transactions yet</div>
          <div className="text-xs text-dark-500 mt-1">Transactions will appear here once you send or receive BTC</div>
        </div>
      )}

      {/* Transaction list */}
      {!loading && !error && transactions.length > 0 && (
        <div className="card divide-y divide-dark-700/50">
          {transactions.map(tx => (
            <TransactionRow key={tx.txid} tx={tx} network={activeNetwork} />
          ))}
        </div>
      )}

      {/* Load More button */}
      {hasMore && !loading && !loadingMore && (
        <button
          onClick={handleLoadMore}
          className="btn btn-secondary w-full mt-3 py-2 text-sm"
        >
          Load More
        </button>
      )}

      {/* Loading more indicator */}
      {loadingMore && (
        <div className="text-center text-dark-500 text-xs mt-3 py-2">Loading more...</div>
      )}
    </div>
  );
}
