import { useState, useMemo } from 'react';
import { useCharms } from '@/stores/charmsStore';
import { useUTXOs } from '@/stores/utxoStore';
import { getBroTokenAppId } from '@/services/charms/charms-explorer-api';
import AddressCard from '../ui/AddressCard';
import BalanceCards from '../ui/BalanceCards';
import AssetsList from '../ui/AssetsList';
import SendScreen from '../SendScreen';
import ReceiveScreen from './ReceiveScreen';

export default function HomeScreen({ primaryAddress, isSyncing, syncPhase, syncUTXOs, onViewAllAssets }) {
  const { charms, getTotalByAppId, groupTokensByAppId, getNFTs, isLoading: charmsLoading } = useCharms();
  const { totalBalance, pendingBalance } = useUTXOs();
  const [showSend, setShowSend] = useState(false);

  const broBalance = useMemo(() => getTotalByAppId(getBroTokenAppId()), [charms, getTotalByAppId]);
  const tokens = useMemo(() => groupTokensByAppId(), [charms, groupTokensByAppId]);
  const nfts = useMemo(() => getNFTs(), [charms, getNFTs]);

  console.log('[HomeScreen] charms.length=', charms.length, 'broBalance=', broBalance, 'broAppId=', getBroTokenAppId()?.slice(0,20));

  return (
    <div className="p-4 space-y-4">
      <AddressCard address={primaryAddress} />

      <BalanceCards
        totalBalance={totalBalance}
        pendingBalance={pendingBalance}
        broBalance={broBalance}
        isSyncing={isSyncing}
        syncPhase={syncPhase}
      />

      <div className="flex gap-3">
        <button onClick={() => setShowSend(true)} className="btn btn-bitcoin flex-1 py-3">
          <span className="mr-1">↗</span> Send
        </button>
        <ReceiveScreen
          trigger={
            <button className="btn btn-secondary flex-1 py-3">
              <span className="mr-1">↙</span> Receive
            </button>
          }
        />
      </div>

      <div className="card">
        <div className="flex items-center justify-between p-3 border-b border-dark-700">
          <span className="text-sm font-medium text-white">Assets</span>
          <button onClick={onViewAllAssets} className="text-xs text-primary-400 hover:text-primary-300">
            View All →
          </button>
        </div>
        <div className="p-2">
          <AssetsList
            tokens={tokens}
            nfts={nfts}
            isSyncing={isSyncing}
            isLoading={charmsLoading}
            preview
            onViewAll={onViewAllAssets}
          />
        </div>
      </div>

      {showSend && <SendScreen onClose={() => setShowSend(false)} syncUTXOs={syncUTXOs} />}
    </div>
  );
}
