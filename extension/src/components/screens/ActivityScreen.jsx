import { useState, useEffect, useCallback } from 'react';
import { useAddresses } from '@/stores/addressesStore';
import { useNetwork } from '@/contexts/NetworkContext';
import { mempoolService } from '@/services/shared/mempool-service';

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

/**
 * Analyze a raw mempool.space transaction to determine direction and net amount
 * relative to a set of wallet addresses.
 */
function analyzeTransaction(tx, walletAddressSet) {
  // Sum of our addresses in inputs (what we spent)
  let inputFromUs = 0;
  let inputTotal = 0;
  for (const vin of tx.vin || []) {
    const addr = vin.prevout?.scriptpubkey_address;
    const value = vin.prevout?.value || 0;
    inputTotal += value;
    if (addr && walletAddressSet.has(addr)) {
      inputFromUs += value;
    }
  }

  // Sum of our addresses in outputs (what we received back / change)
  let outputToUs = 0;
  let outputTotal = 0;
  for (const vout of tx.vout || []) {
    const addr = vout.scriptpubkey_address;
    const value = vout.value || 0;
    outputTotal += value;
    if (addr && walletAddressSet.has(addr)) {
      outputToUs += value;
    }
  }

  const fee = tx.fee || (inputTotal - outputTotal);

  if (inputFromUs > 0) {
    // We had inputs → this is a send
    // Net amount sent = what we put in - what came back to us - fee
    const netSent = inputFromUs - outputToUs - fee;
    return { direction: 'out', amount: Math.max(0, netSent), fee };
  } else {
    // None of our addresses in inputs → this is a receive
    return { direction: 'in', amount: outputToUs, fee };
  }
}

function ConfirmationBadge({ confirmations }) {
  if (confirmations === 0 || confirmations == null) {
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
  const [error, setError] = useState(null);

  const fetchTransactions = useCallback(async () => {
    if (!addresses || addresses.length === 0) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Build set of ALL wallet addresses (receive + change) for direction analysis
      const allAddressSet = new Set(addresses.map(a => a.address));

      // Only fetch for non-change addresses to avoid duplicate API calls
      const receiveAddresses = addresses.filter(a => !a.isChange).map(a => a.address);

      // Get current block height for confirmations
      let tipHeight = null;
      try {
        const baseUrl = activeNetwork === 'mainnet' ? 'https://mempool.space/api' : 'https://mempool.space/testnet4/api';
        const resp = await fetch(`${baseUrl}/blocks/tip/height`);
        if (resp.ok) tipHeight = parseInt(await resp.text(), 10);
      } catch (_) {}

      // Fetch history from mempool.space for each address
      const results = await Promise.allSettled(
        receiveAddresses.map(addr => mempoolService.getAddressTransactions(addr, activeNetwork))
      );

      // Merge, deduplicate, analyze direction
      const seen = new Set();
      const merged = [];

      for (const r of results) {
        if (r.status !== 'fulfilled' || !Array.isArray(r.value)) continue;
        for (const rawTx of r.value) {
          if (seen.has(rawTx.txid)) continue;
          seen.add(rawTx.txid);

          const { direction, amount, fee } = analyzeTransaction(rawTx, allAddressSet);
          const confirmed = rawTx.status?.confirmed || false;
          const blockHeight = rawTx.status?.block_height || null;
          const blockTime = rawTx.status?.block_time || null;
          const confirmations = (confirmed && tipHeight && blockHeight)
            ? Math.max(0, tipHeight - blockHeight + 1)
            : 0;

          merged.push({
            txid: rawTx.txid,
            direction,
            amount,
            fee,
            block_time: blockTime,
            confirmations,
          });
        }
      }

      // Sort: pending first, then by block_time descending
      merged.sort((a, b) => {
        if (!a.block_time && b.block_time) return -1;
        if (a.block_time && !b.block_time) return 1;
        return (b.block_time || 0) - (a.block_time || 0);
      });

      setTransactions(merged);
    } catch (err) {
      console.error('[ActivityScreen] Error fetching transactions:', err);
      setError(err.message || 'Failed to fetch transactions');
    } finally {
      setLoading(false);
    }
  }, [addresses, activeNetwork]);

  // Reset and fetch when network changes
  useEffect(() => {
    setTransactions([]);
    fetchTransactions();
  }, [activeNetwork, fetchTransactions]);

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
            onClick={() => fetchTransactions()}
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
    </div>
  );
}
