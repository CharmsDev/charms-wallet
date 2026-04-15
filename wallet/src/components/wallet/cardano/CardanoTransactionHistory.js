'use client';

/**
 * Cardano Transaction History — fetches and displays Cardano transactions.
 * Uses Koios/Blockfrost via the Cardano API router.
 */

import { useState, useEffect, useCallback } from 'react';
import { useCardano } from '@/stores/cardanoStore';
import { useBlockchain } from '@/stores/blockchainStore';
import { fetchAddressTxs, getCardanoTx } from '@/services/cardano/api';

export default function CardanoTransactionHistory() {
  const { addresses } = useCardano();
  const { isCardano } = useBlockchain();
  const [txs, setTxs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null);
  const [txDetails, setTxDetails] = useState({}); // { hash: detail }

  const loadTxs = useCallback(async () => {
    if (!addresses.length) return;
    setIsLoading(true);
    try {
      const addr = addresses[0]?.address;
      if (!addr) return;
      const data = await fetchAddressTxs(addr, 50);
      setTxs(Array.isArray(data) ? data : []);
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
    return d.toLocaleString();
  };

  const explorerUrl = (hash) => `https://cardanoscan.io/transaction/${hash}`;

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

            return (
              <div key={hash || i}>
                {/* Row */}
                <div
                  onClick={() => {
                    const newHash = isSelected ? null : hash;
                    setSelectedTx(newHash);
                    // Fetch detail on expand if not cached
                    if (newHash && !txDetails[newHash]) {
                      getCardanoTx(newHash).then(detail => {
                        if (detail) setTxDetails(prev => ({ ...prev, [newHash]: detail }));
                      }).catch(() => {});
                    }
                  }}
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    isSelected ? 'bg-cardano-500/10 border border-cardano-500/30' : 'bg-dark-800/50 hover:bg-dark-800 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-cardano-500/15 flex items-center justify-center text-cardano-400 text-xs font-bold flex-shrink-0">
                      TX
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm text-white font-mono truncate">{hash.slice(0, 16)}...{hash.slice(-8)}</div>
                      <div className="text-xs text-dark-400">{formatTime(blockTime)}</div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs text-dark-400">Block {blockHeight}</div>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-900/30 text-green-400">
                      confirmed
                    </span>
                  </div>
                </div>

                {/* Detail (expandable) */}
                {isSelected && (() => {
                  const detail = txDetails[hash];
                  const fee = detail?.fee || detail?.fees || tx.fees;
                  const outputAda = detail?.output_amount?.find(a => a.unit === 'lovelace');
                  const outputTokens = detail?.output_amount?.filter(a => a.unit !== 'lovelace') || [];

                  return (
                    <div className="bg-dark-900 rounded-lg p-4 mt-1 mb-2 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-dark-400">Transaction ID</span>
                        <a href={explorerUrl(hash)} target="_blank" rel="noopener noreferrer" className="text-cardano-400 hover:underline font-mono">
                          {hash.slice(0, 20)}...
                        </a>
                      </div>
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
                      {fee && (
                        <div className="flex justify-between">
                          <span className="text-dark-400">Fee</span>
                          <span className="text-white font-mono">{(parseInt(fee) / 1_000_000).toFixed(6)} ADA</span>
                        </div>
                      )}
                      {outputAda && (
                        <div className="flex justify-between">
                          <span className="text-dark-400">Output</span>
                          <span className="text-white font-mono">{(parseInt(outputAda.quantity) / 1_000_000).toFixed(6)} ADA</span>
                        </div>
                      )}
                      {outputTokens.length > 0 && (
                        <div>
                          <span className="text-dark-400">Tokens:</span>
                          {outputTokens.map((t, j) => (
                            <div key={j} className="flex justify-between pl-2 mt-1">
                              <span className="text-dark-500 font-mono truncate max-w-[200px]">{t.unit.slice(0, 20)}...</span>
                              <span className="text-white font-mono">{t.quantity}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {!detail && (
                        <div className="text-dark-500 italic">Loading details...</div>
                      )}
                      <div className="pt-2">
                        <a href={explorerUrl(hash)} target="_blank" rel="noopener noreferrer" className="text-cardano-400 hover:underline text-xs">
                          View on CardanoScan →
                        </a>
                      </div>
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
