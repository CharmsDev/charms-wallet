'use client';

/**
 * Cardano wallet totals — mirrors the Bitcoin `PortfolioSummary` card so the
 * two dashboards feel like siblings. Shows UTxO count, native-asset count,
 * address count, and active network.
 */

import { useCardano } from '@/stores/cardanoStore';
import { useBlockchain } from '@/stores/blockchainStore';

export default function CardanoPortfolioSummary() {
  const { utxos, assets, addresses, isLoading } = useCardano();
  const { activeNetwork } = useBlockchain();

  const cards = [
    { title: 'UTXOs', value: utxos?.length ?? 0, icon: '💰', color: 'text-cardano-400' },
    { title: 'Assets', value: assets?.length ?? 0, icon: '✨', color: 'text-purple-400' },
    { title: 'Addresses', value: addresses?.length ?? 0, icon: '🏷️', color: 'text-cyan-400' },
    { title: 'Network', value: activeNetwork || '—', icon: '🌐', color: 'text-green-400', isText: true },
  ];

  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold gradient-text mb-4">Portfolio Summary</h3>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="glass-effect p-3 rounded-lg space-y-2">
              <div className="h-3 bg-dark-700 rounded w-16 animate-pulse" />
              <div className="h-5 bg-dark-700 rounded w-20 animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {cards.map((c) => (
            <div key={c.title} className="glass-effect p-4 rounded-lg hover:bg-dark-800/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-dark-400 mb-1">{c.title}</p>
                  <p className={`${c.isText ? 'text-lg' : 'text-3xl'} font-bold ${c.color} capitalize`}>{c.value}</p>
                </div>
                <div className="text-3xl opacity-60">{c.icon}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
