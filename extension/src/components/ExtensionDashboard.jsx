import { useState, useMemo } from 'react';
import { useWallet } from '@/stores/walletStore';
import { useAddresses } from '@/stores/addressesStore';
import { useUTXOs } from '@/stores/utxoStore';
import { useNetwork } from '@/contexts/NetworkContext';
import { useExtensionWalletSync } from '../hooks/useExtensionWalletSync';
import { useBlockchain } from '@/stores/blockchainStore';
import { useDashboardSync } from '../hooks/useDashboardSync';
import { useNetworkSwitch } from '../hooks/useNetworkSwitch';
import DashboardHeader from './ui/DashboardHeader';
import BottomNav from './ui/BottomNav';
import HomeScreen from './screens/HomeScreen';
import AssetsScreen from './screens/AssetsScreen';
import ActivityScreen from './screens/ActivityScreen';
import SettingsScreen from './screens/SettingsScreen';

export default function ExtensionDashboard() {
  const { hasWallet } = useWallet();
  const { addresses, loadAddresses } = useAddresses();
  const { activeNetwork, saveNetwork, getAvailableNetworks } = useNetwork();
  const { activeBlockchain } = useBlockchain();
  const { syncFullWallet, syncUTXOs, isSyncing, syncPhase } = useExtensionWalletSync();
  const { loadUTXOs } = useUTXOs();
  const [activeScreen, setActiveScreen] = useState('home');

  const { lastSynced, handleManualSync } = useDashboardSync({
    hasWallet, activeBlockchain, activeNetwork,
    loadAddresses, loadUTXOs, syncFullWallet,
  });

  const { isSwitchingNetwork, handleNetworkSwitch } = useNetworkSwitch({
    activeNetwork, activeBlockchain, isSyncing,
    saveNetwork, loadAddresses, loadUTXOs,
    setLastSynced: () => {},
  });

  const networkLabel = useMemo(() => {
    const found = getAvailableNetworks().find(n => n.id === activeNetwork);
    return found ? found.name : activeNetwork;
  }, [activeNetwork, getAvailableNetworks]);

  const primaryAddress = useMemo(
    () => addresses?.[0]?.address || '',
    [addresses]
  );

  return (
    <div className="flex flex-col h-full bg-dark-950">
      <DashboardHeader
        activeNetwork={activeNetwork}
        networkLabel={networkLabel}
        isSyncing={isSyncing}
        syncPhase={syncPhase}
        lastSynced={lastSynced}
        onSync={handleManualSync}
      />

      <div className="flex-1 overflow-auto">
        {activeScreen === 'home' && (
          <HomeScreen
            primaryAddress={primaryAddress}
            isSyncing={isSyncing}
            syncPhase={syncPhase}
            syncUTXOs={syncUTXOs}
            onViewAllAssets={() => setActiveScreen('assets')}
          />
        )}
        {activeScreen === 'assets' && <AssetsScreen isSyncing={isSyncing} />}
        {activeScreen === 'activity' && <ActivityScreen />}
        {activeScreen === 'settings' && (
          <SettingsScreen
            activeNetwork={activeNetwork}
            getAvailableNetworks={getAvailableNetworks}
            isSwitchingNetwork={isSwitchingNetwork}
            isSyncing={isSyncing}
            onNetworkSwitch={handleNetworkSwitch}
          />
        )}
      </div>

      <BottomNav activeScreen={activeScreen} onNavigate={setActiveScreen} />
    </div>
  );
}
