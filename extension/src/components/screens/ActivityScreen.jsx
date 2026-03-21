import { useState, useEffect, useCallback } from 'react';
import { useAddresses } from '@/stores/addressesStore';
import { useNetwork } from '@/contexts/NetworkContext';
import { mempoolService } from '@/services/shared/mempool-service';
import { EXPLORER_API } from '@/services/charm-transfer/constants';

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(blockTime) {
  if (!blockTime) return 'Pending';
  const txDate = new Date(blockTime * 1000);
  const now = new Date();

  // Compare by calendar day (not raw milliseconds)
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const txDay = new Date(txDate); txDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today - txDay) / 86400000);

  if (diffDays === 0) return txDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return txDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function satsToBtc(sats) {
  return (Math.abs(sats) / 1e8).toFixed(8).replace(/\.?0+$/, '');
}

function tokenAmountDisplay(rawAmount) {
  // BRO uses 8 decimals (amount 333000000 = 3.33 BRO)
  return (rawAmount / 1e8).toFixed(4).replace(/\.?0+$/, '');
}

function getMempoolTxUrl(txid, network) {
  return network === 'mainnet'
    ? `https://mempool.space/tx/${txid}`
    : `https://mempool.space/testnet4/tx/${txid}`;
}

// ── Transaction Analysis ────────────────────────────────────────────────────

function analyzeTransaction(tx, allWalletAddresses) {
  let inputFromUs = 0;
  let outputToUs = 0;

  for (const vin of tx.vin || []) {
    if (allWalletAddresses.has(vin.prevout?.scriptpubkey_address)) {
      inputFromUs += vin.prevout?.value || 0;
    }
  }
  for (const vout of tx.vout || []) {
    if (allWalletAddresses.has(vout.scriptpubkey_address)) {
      outputToUs += vout.value || 0;
    }
  }

  const fee = tx.fee || 0;
  const netFlow = outputToUs - inputFromUs;

  if (netFlow >= 0 && inputFromUs === 0) {
    return { direction: 'in', amount: outputToUs, fee };
  } else if (netFlow >= 0) {
    return { direction: 'in', amount: netFlow, fee };
  } else {
    return { direction: 'out', amount: Math.abs(netFlow), fee };
  }
}

// ── Charm Enrichment via Explorer API ───────────────────────────────────────

async function enrichWithCharmData(txids) {
  const BATCH = 5;
  const charmMap = new Map(); // txid → { name, symbol, amount, tags }

  for (let i = 0; i < txids.length; i += BATCH) {
    const batch = txids.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(txid =>
        fetch(`${EXPLORER_API}/v1/transactions/${txid}`)
          .then(r => r.ok ? r.json() : null)
      )
    );

    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value) continue;
      const data = r.value;
      if (data.charm && data.charm.detected) {
        // Has charm data — now fetch asset details
        charmMap.set(data.txid, { detected: true, tags: data.tags });
      }
    }
  }

  // For charm txs, fetch asset details from /v1/charms/{txid}
  const charmTxids = [...charmMap.keys()];
  for (let i = 0; i < charmTxids.length; i += BATCH) {
    const batch = charmTxids.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(txid =>
        fetch(`${EXPLORER_API}/v1/charms/${txid}`)
          .then(r => r.ok ? r.json() : null)
      )
    );

    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value) continue;
      const d = r.value;
      const existing = charmMap.get(d.txid) || {};
      charmMap.set(d.txid, {
        ...existing,
        name: d.name || 'Charm',
        symbol: d.symbol || d.name || 'CHARM',
        amount: d.amount || 0,
        assetType: d.asset_type || 'token',
        verified: d.verified || false,
      });
    }
  }

  return charmMap;
}

// ── UI Components ───────────────────────────────────────────────────────────

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
  const isCharm = !!tx.charm;
  const mempoolUrl = getMempoolTxUrl(tx.txid, network);

  // Determine display
  let icon, iconClass, label, amountText, amountClass;

  if (isCharm) {
    const tokenName = tx.charm.symbol || tx.charm.name || 'CHARM';
    const tokenAmount = tokenAmountDisplay(tx.charm.amount);

    if (isReceived) {
      icon = '↓'; iconClass = 'bg-purple-500/20 text-purple-400';
      label = `Received ${tokenName}`;
      amountText = `+${tokenAmount} ${tokenName}`;
      amountClass = 'text-purple-400';
    } else {
      icon = '↑'; iconClass = 'bg-purple-500/20 text-purple-400';
      label = `Sent ${tokenName}`;
      amountText = `-${tokenAmount} ${tokenName}`;
      amountClass = 'text-purple-400';
    }
  } else {
    if (isReceived) {
      icon = '↓'; iconClass = 'bg-green-500/20 text-green-400';
      label = 'Received';
      amountText = `+${satsToBtc(tx.amount)} BTC`;
      amountClass = 'text-green-400';
    } else {
      icon = '↑'; iconClass = 'bg-red-500/20 text-red-400';
      label = 'Sent';
      amountText = `-${satsToBtc(tx.amount)} BTC`;
      amountClass = 'text-red-400';
    }
  }

  return (
    <a
      href={mempoolUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 px-3 py-3 hover:bg-dark-800/50 rounded-lg transition-colors cursor-pointer"
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${iconClass}`}>
        {icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-dark-200">{label}</span>
          <ConfirmationBadge confirmations={tx.confirmations} />
        </div>
        <div className="text-xs text-dark-500 mt-0.5 truncate">{tx.txid}</div>
      </div>

      <div className="text-right flex-shrink-0">
        <div className={`text-sm font-medium ${amountClass}`}>
          {amountText}
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

// ── Main Component ──────────────────────────────────────────────────────────

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

      const allAddressSet = new Set(addresses.map(a => a.address));
      const allUniqueAddresses = [...allAddressSet];

      // Get current block height
      let tipHeight = null;
      try {
        const baseUrl = activeNetwork === 'mainnet' ? 'https://mempool.space/api' : 'https://mempool.space/testnet4/api';
        const resp = await fetch(`${baseUrl}/blocks/tip/height`);
        if (resp.ok) tipHeight = parseInt(await resp.text(), 10);
      } catch (_) {}

      // Fetch from mempool.space for ALL addresses (batches of 5)
      const BATCH = 5;
      const rawTxMap = new Map();

      for (let i = 0; i < allUniqueAddresses.length; i += BATCH) {
        const batch = allUniqueAddresses.slice(i, i + BATCH);
        const results = await Promise.allSettled(
          batch.map(addr => mempoolService.getAddressTransactions(addr, activeNetwork))
        );
        for (const r of results) {
          if (r.status !== 'fulfilled' || !Array.isArray(r.value)) continue;
          for (const rawTx of r.value) {
            if (!rawTxMap.has(rawTx.txid)) rawTxMap.set(rawTx.txid, rawTx);
          }
        }
      }

      // Analyze each transaction
      const merged = [];
      for (const [txid, rawTx] of rawTxMap) {
        const { direction, amount, fee } = analyzeTransaction(rawTx, allAddressSet);
        const confirmed = rawTx.status?.confirmed || false;
        const blockHeight = rawTx.status?.block_height || null;
        const blockTime = rawTx.status?.block_time || null;
        const confirmations = (confirmed && tipHeight && blockHeight)
          ? Math.max(0, tipHeight - blockHeight + 1)
          : 0;

        merged.push({ txid, direction, amount, fee, block_time: blockTime, confirmations });
      }

      // Sort: pending first, then by block_time desc
      merged.sort((a, b) => {
        if (!a.block_time && b.block_time) return -1;
        if (a.block_time && !b.block_time) return 1;
        return (b.block_time || 0) - (a.block_time || 0);
      });

      // Enrich with charm data from Explorer API
      const txids = merged.map(t => t.txid);
      const charmMap = await enrichWithCharmData(txids);

      for (const tx of merged) {
        const charm = charmMap.get(tx.txid);
        if (charm) tx.charm = charm;
      }

      setTransactions(merged);
    } catch (err) {
      console.error('[ActivityScreen] Error fetching transactions:', err);
      setError(err.message || 'Failed to fetch transactions');
    } finally {
      setLoading(false);
    }
  }, [addresses, activeNetwork]);

  useEffect(() => {
    setTransactions([]);
    fetchTransactions();
  }, [activeNetwork, fetchTransactions]);

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold gradient-text mb-4">Activity</h2>

      {loading && (
        <div className="card">
          <SkeletonRows />
        </div>
      )}

      {!loading && error && (
        <div className="card p-4">
          <div className="text-red-400 text-sm mb-2">Failed to load transactions</div>
          <div className="text-xs text-dark-500 mb-3">{error}</div>
          <button onClick={() => fetchTransactions()} className="btn btn-secondary text-xs px-3 py-1.5">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && transactions.length === 0 && (
        <div className="card p-8 text-center">
          <div className="text-4xl mb-3">📋</div>
          <div className="text-dark-400">No transactions yet</div>
          <div className="text-xs text-dark-500 mt-1">Transactions will appear here once you send or receive BTC</div>
        </div>
      )}

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
