import { useMemo } from 'react';
import { useCharms } from '@/stores/charmsStore';
import { useBlockchain } from '@/stores/blockchainStore';
import { useCardano } from '@/stores/cardanoStore';
import AssetsList from '../ui/AssetsList';

function CardanoAssetsView() {
  const assets = useCardano(s => s.assets);
  if (!assets?.length) {
    return (
      <div className="card p-6 text-center">
        <p className="text-sm text-dark-300">No Cardano native assets yet.</p>
        <p className="text-xs text-dark-500 mt-2">
          Beam tokens from Bitcoin (BRO, eBTC) or hold any CNT and they'll appear here.
        </p>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {assets.map((a) => {
        const decimals = a.decimals || 0;
        const display = decimals > 0
          ? (Number(BigInt(a.quantity)) / Math.pow(10, decimals)).toLocaleString(undefined, {
              maximumFractionDigits: decimals,
            })
          : a.quantity;
        return (
          <li key={a.unit} className="card p-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">
                {a.name || a.assetName?.slice(0, 24) || 'Token'}
              </p>
              <p className="text-[10px] font-mono text-dark-500 truncate">
                {a.ticker ? `${a.ticker} · ` : ''}{a.unit.slice(0, 24)}…
              </p>
            </div>
            <span className="text-sm font-mono text-cardano-400 flex-shrink-0">{display}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default function AssetsScreen({ isSyncing }) {
  const { isCardano } = useBlockchain();
  const { charms, groupTokensByAppId, getNFTs, isLoading } = useCharms();

  const tokens = useMemo(() => groupTokensByAppId(), [charms, groupTokensByAppId]);
  const nfts = useMemo(() => getNFTs(), [charms, getNFTs]);

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold gradient-text mb-4">Your Assets</h2>
      {isCardano?.() ? (
        <CardanoAssetsView />
      ) : (
        <AssetsList tokens={tokens} nfts={nfts} isSyncing={isSyncing} isLoading={isLoading} />
      )}
    </div>
  );
}
