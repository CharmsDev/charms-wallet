import { useMemo } from 'react';
import { useCharms } from '@/stores/charmsStore';
import AssetsList from '../ui/AssetsList';

export default function AssetsScreen({ isSyncing }) {
  const { charms, groupTokensByAppId, getNFTs, isLoading } = useCharms();

  const tokens = useMemo(() => groupTokensByAppId(), [charms, groupTokensByAppId]);
  const nfts = useMemo(() => getNFTs(), [charms, getNFTs]);

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold gradient-text mb-4">Your Assets</h2>
      <AssetsList tokens={tokens} nfts={nfts} isSyncing={isSyncing} isLoading={isLoading} />
    </div>
  );
}
