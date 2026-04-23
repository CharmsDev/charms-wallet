'use client';

/**
 * Cardano Transaction History — fetches and displays Cardano transactions.
 * Uses Koios/Blockfrost via the Cardano API router.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useCardano } from '@/stores/cardanoStore';
import { useBlockchain } from '@/stores/blockchainStore';
import { fetchAddressTxs, getCardanoTx, getCardanoTxsBatch } from '@/services/cardano/api';
import { classifyCardanoTx, CARDANO_TX_TYPE, CARDANO_TX_ICON } from '@/services/cardano/tx-classifier';
import { cardanoTxUrl } from '@/utils/cardanoExplorer';

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };
  return (
    <button onClick={copy} title="Copy" className="ml-1 text-dark-500 hover:text-cardano-400 transition-colors flex-shrink-0">
      {copied
        ? <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
      }
    </button>
  );
}

export default function CardanoTransactionHistory() {
  const { addresses, currentNetwork } = useCardano();
  const { isCardano } = useBlockchain();
  const network = currentNetwork?.replace('cardano-', '') || 'mainnet';
  const [txs, setTxs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);
  const [txDetails, setTxDetails] = useState({}); // { hash: detail }

  const ownAddresses = useMemo(() => addresses.map(a => a.address).filter(Boolean), [addresses]);

  const loadTxs = useCallback(async () => {
    if (!addresses.length) return;
    setIsLoading(true);
    try {
      const addr = addresses[0]?.address;
      if (!addr) return;
      const data = await fetchAddressTxs(addr, 50);
      const raw = Array.isArray(data) ? data : [];
      // Sort most-recent first by block height (Koios returns blocks scanned
      // in chain order; an explicit sort protects against any provider that
      // returns them in scan order instead).
      const list = [...raw].sort((a, b) => {
        const bh = (b.block_height || 0) - (a.block_height || 0);
        if (bh !== 0) return bh;
        return (b.block_time || 0) - (a.block_time || 0);
      });
      setTxs(list);
      // Batch-fetch details for classification
      const hashes = list.map(t => t.tx_hash || t.hash).filter(Boolean);
      if (hashes.length) {
        const detailMap = await getCardanoTxsBatch(hashes);
        setTxDetails(prev => ({ ...prev, ...detailMap }));
      }
    } catch (err) {
      console.error('[CardanoTxHistory] Error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [addresses]);

  useEffect(() => {
    if (isCardano()) loadTxs();
  }, [isCardano, loadTxs]);

  if (!isCardano()) return null;

  const formatTime = (ts) => {
    if (!ts) return '—';
    const d = new Date(typeof ts === 'number' ? ts * 1000 : ts);
    // UTC — block times are chain-wide timestamps, so showing UTC avoids
    // surprises when comparing with explorers or multiple machines.
    return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
  };

  const explorerUrl = (hash) => cardanoTxUrl(hash, network);

  return (
    <div>
      <div className="p-6 flex justify-between items-center">
        <h2 className="text-xl font-bold gradient-text">Cardano Transactions</h2>
        <button
          onClick={loadTxs}
          disabled={isLoading}
          className="btn btn-secondary text-sm"
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {txs.length === 0 && !isLoading && (
        <div className="card p-8 text-center">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-dark-400">No Cardano transactions found</p>
          <p className="text-dark-500 text-xs mt-1">Transactions will appear after your first ADA transfer or beam</p>
        </div>
      )}

      {txs.length > 0 && (
        <div className="space-y-2 px-2 md:px-4">
          {txs.map((tx, i) => {
            const hash = tx.tx_hash || tx.hash || '';
            const blockHeight = tx.block_height || tx.block || '';
            const blockTime = tx.block_time || tx.tx_timestamp || '';
            const isSelected = selectedTx === hash;
            const detail = txDetails[hash];
            const cls = classifyCardanoTx(detail, ownAddresses);
            const icon = CARDANO_TX_ICON[cls.type] || 'TX';
            const amountStr = (() => {
              if (cls.amount == null) return '';
              if (cls.token) {
                const display = Number(cls.amount) / Math.pow(10, cls.token.decimals);
                // Show enough precision to see the smallest unit for tiny
                // amounts (e.g. 0.00002109 eBTC). Trim trailing zeros after
                // the decimal point so normal amounts stay readable.
                const fixed = display.toFixed(cls.token.decimals);
                const trimmed = fixed.replace(/\.?0+$/, '');
                return `${trimmed || '0'} ${cls.token.ticker}`;
              }
              return `${(Number(cls.amount) / 1_000_000).toFixed(6)} ADA`;
            })();
            const amountColor = cls.direction === 'in' ? 'text-green-400' : cls.direction === 'out' ? 'text-red-400' : 'text-dark-400';

            return (
              <div key={hash || i}>
                {/* Row */}
                <div
                  onClick={() => {
                    const newHash = isSelected ? null : hash;
                    setSelectedTx(newHash);
                    // Fetch detail on expand if not cached
                    if (newHash && !txDetails[newHash]) {
                      getCardanoTx(newHash).then(d => {
                        if (d) setTxDetails(prev => ({ ...prev, [newHash]: d }));
                      }).catch(() => {});
                    }
                  }}
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    isSelected ? 'bg-cardano-500/10 border border-cardano-500/30' : 'bg-dark-800/50 hover:bg-dark-800 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-cardano-500/15 flex items-center justify-center text-cardano-400 text-base font-bold flex-shrink-0">
                      {icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm text-white truncate">{cls.label}</div>
                      <div className="text-xs text-dark-500 font-mono truncate">{hash.slice(0, 16)}...{hash.slice(-8)}</div>
                      <div className="text-xs text-dark-400">{formatTime(blockTime)}</div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {amountStr && <div className={`text-sm font-mono ${amountColor}`}>{cls.direction === 'out' ? '−' : cls.direction === 'in' ? '+' : ''}{amountStr}</div>}
                    <div className="text-xs text-dark-400">Block {blockHeight}</div>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-900/30 text-green-400">
                      confirmed
                    </span>
                  </div>
                </div>

                {/* Detail (expandable) */}
                {isSelected && (() => {
                  const fee = detail?.fee || detail?.fees || tx.fees;
                  // Destination addresses: outputs NOT owned by this wallet
                  const destOutputs = (detail?.outputs || []).filter(o => {
                    const addr = o.payment_addr?.bech32 || o.address || '';
                    return addr && !ownAddresses.includes(addr);
                  });
                  const destAddresses = [...new Set(destOutputs.map(o => o.payment_addr?.bech32 || o.address || '').filter(Boolean))];

                  const outputAda = detail?.output_amount?.find(a => a.unit === 'lovelace');
                  const outputTokens = detail?.output_amount?.filter(a => a.unit !== 'lovelace') || [];

                  return (
                    <div className="bg-dark-900 rounded-lg p-4 mt-1 mb-2 space-y-3 text-xs">
                      {/* TX Hash — full + copy + explorer */}
                      <div>
                        <div className="text-dark-400 mb-1">Transaction ID</div>
                        <div className="flex items-start gap-1">
                          <span className="font-mono text-white break-all leading-relaxed">{hash}</span>
                          <CopyButton text={hash} />
                        </div>
                        <a href={explorerUrl(hash)} target="_blank" rel="noopener noreferrer" className="text-cardano-400 hover:underline mt-1 inline-block">
                          View on explorer ↗
                        </a>
                      </div>

                      {/* Destination address(es) */}
                      {destAddresses.length > 0 && (
                        <div>
                          <div className="text-dark-400 mb-1">{destAddresses.length > 1 ? 'To (addresses)' : 'To'}</div>
                          {destAddresses.map((addr, j) => (
                            <div key={j} className="flex items-start gap-1 mt-1">
                              <span className="font-mono text-white break-all leading-relaxed">{addr}</span>
                              <CopyButton text={addr} />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Amount */}
                      {amountStr && (
                        <div className="flex justify-between items-center">
                          <span className="text-dark-400">Amount</span>
                          <span className={`font-mono font-bold ${amountColor}`}>
                            {cls.direction === 'out' ? '−' : cls.direction === 'in' ? '+' : ''}{amountStr}
                          </span>
                        </div>
                      )}

                      {/* Fee */}
                      {fee && (
                        <div className="flex justify-between">
                          <span className="text-dark-400">Fee</span>
                          <span className="text-white font-mono">{(parseInt(fee) / 1_000_000).toFixed(6)} ADA</span>
                        </div>
                      )}

                      {/* Block + time */}
                      {blockHeight && (
                        <div className="flex justify-between">
                          <span className="text-dark-400">Block</span>
                          <span className="text-white font-mono">{blockHeight}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-dark-400">Time</span>
                        <span className="text-white">{formatTime(blockTime)}</span>
                      </div>

                      {/* Output tokens (non-ADA) */}
                      {outputTokens.length > 0 && (
                        <div>
                          <div className="text-dark-400 mb-1">Tokens</div>
                          {outputTokens.map((t, j) => (
                            <div key={j} className="flex justify-between pl-2 mt-1 gap-2">
                              <span className="text-dark-500 font-mono break-all">{t.unit}</span>
                              <span className="text-white font-mono flex-shrink-0">{t.quantity}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {!detail && (
                        <div className="text-dark-500 italic">Loading details...</div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
