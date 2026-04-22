'use client';

/**
 * Cardano UTXOs view.
 *
 * Reads from `cardanoStore` (populated by the store's `refresh()`, which also
 * persists to localStorage under `wallet:cardano:<network>:utxos`). The
 * Refresh button re-runs the same `refresh()` used by the dashboard and beam
 * flows, so all three views stay in sync.
 */

import { useMemo } from 'react';
import { useCardano } from '@/stores/cardanoStore';
import { useBlockchain } from '@/stores/blockchainStore';

export default function CardanoUTXOList() {
  const { utxos, addresses, isRefreshing, refresh, adaBalance } = useCardano();
  const { isCardano } = useBlockchain();

  const rows = useMemo(() => {
    return (utxos || []).map(u => {
      const addrMeta = addresses.find(a => a.address === u.address);
      return {
        utxoId: `${u.txHash}:${u.outputIndex}`,
        txHash: u.txHash,
        outputIndex: u.outputIndex,
        address: u.address,
        addressIndex: addrMeta?.index ?? null,
        lovelace: BigInt(u.lovelace || '0'),
        assets: u.assets || [],
      };
    }).sort((a, b) => {
      if (a.addressIndex !== b.addressIndex) return (a.addressIndex ?? 0) - (b.addressIndex ?? 0);
      return b.lovelace > a.lovelace ? 1 : -1;
    });
  }, [utxos, addresses]);

  if (!isCardano()) return null;

  const totalAda = (Number(adaBalance || '0') / 1_000_000).toFixed(6);

  return (
    <div>
      <div className="p-4 sm:p-6 flex justify-between items-center">
        <h2 className="text-xl font-bold gradient-text hidden md:block">Cardano UTXOs</h2>
        <div className="flex items-center gap-3">
          <div className="text-sm text-dark-300">
            Total: <span className="text-cardano-400 font-mono">{totalAda} ADA</span>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => refresh()}
            disabled={isRefreshing}
          >
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <div className="text-center p-8">
            <p className="text-dark-300">No Cardano UTXOs found for this address.</p>
            <p className="text-dark-500 text-xs mt-1">Send ADA to the payment address or beam tokens from Bitcoin.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-dark-700">
                <tr>
                  <th className="py-2 px-4 border-b border-dark-600 text-left text-dark-300">UTXO</th>
                  <th className="py-2 px-4 border-b border-dark-600 text-left text-dark-300">Address</th>
                  <th className="py-2 px-4 border-b border-dark-600 text-left text-dark-300">ADA</th>
                  <th className="py-2 px-4 border-b border-dark-600 text-left text-dark-300">Assets</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.utxoId} className={i % 2 === 0 ? 'bg-dark-800' : 'bg-dark-750'}>
                    <td className="py-2 px-4 border-b border-dark-700">
                      <div className="font-mono text-xs break-all text-dark-200" title={r.utxoId}>
                        {r.txHash.slice(0, 16)}…:{r.outputIndex}
                      </div>
                    </td>
                    <td className="py-2 px-4 border-b border-dark-700">
                      <div className="font-mono text-xs break-all text-dark-200" title={r.address}>
                        {r.address?.slice(0, 12)}…{r.address?.slice(-8)}
                      </div>
                      {r.addressIndex != null && (
                        <span className="text-xs text-dark-400 mt-1 block">Index: {r.addressIndex}</span>
                      )}
                    </td>
                    <td className="py-2 px-4 border-b border-dark-700">
                      <div className="text-cardano-400 font-mono">
                        {(Number(r.lovelace) / 1_000_000).toFixed(6)}
                      </div>
                    </td>
                    <td className="py-2 px-4 border-b border-dark-700">
                      {r.assets.length === 0 ? (
                        <span className="text-dark-500 text-xs">—</span>
                      ) : (
                        <div className="space-y-1">
                          {r.assets.map((a, j) => (
                            <div key={j} className="text-xs">
                              <span className="text-white font-mono">{a.quantity}</span>
                              <span className="text-dark-400 ml-2 font-mono">
                                {(a.policyId || a.policy_id || '').slice(0, 8)}…
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
