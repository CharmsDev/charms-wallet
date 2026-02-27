import { useState, useCallback } from 'react';
import { StorageAdapter } from '../shared/storage-adapter';
import { GLOBAL_KEYS } from '@/services/storage-keys';

export function useNetworkSwitch({
  activeNetwork,
  activeBlockchain,
  isSyncing,
  saveNetwork,
  loadAddresses,
  loadUTXOs,
  setLastSynced,
}) {
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);

  const handleNetworkSwitch = useCallback(async (newNetwork) => {
    if (newNetwork === activeNetwork || isSwitchingNetwork || isSyncing) return;
    setIsSwitchingNetwork(true);
    try {
      saveNetwork(newNetwork);
      await StorageAdapter.set(GLOBAL_KEYS.ACTIVE_NETWORK, newNetwork);
      await loadAddresses(activeBlockchain, newNetwork);
      await loadUTXOs(activeBlockchain, newNetwork);
      const ts = await StorageAdapter.get(`last_synced_${activeBlockchain}_${newNetwork}`);
      setLastSynced(ts ? new Date(ts) : null);
    } catch (err) {
      console.warn('[NetworkSwitch] Error:', err.message);
    } finally {
      setIsSwitchingNetwork(false);
    }
  }, [activeNetwork, activeBlockchain, isSwitchingNetwork, isSyncing, saveNetwork, loadAddresses, loadUTXOs, setLastSynced]);

  return { isSwitchingNetwork, handleNetworkSwitch };
}
