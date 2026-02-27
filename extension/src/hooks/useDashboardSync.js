import { useState, useEffect, useCallback } from 'react';
import { StorageAdapter } from '../shared/storage-adapter';

export function useDashboardSync({
  hasWallet,
  activeBlockchain,
  activeNetwork,
  loadAddresses,
  loadUTXOs,
  syncFullWallet,
}) {
  const [lastSynced, setLastSynced] = useState(null);

  const persistSync = useCallback(async (date) => {
    setLastSynced(date);
    await StorageAdapter.set(`last_synced_${activeBlockchain}_${activeNetwork}`, date.toISOString());
  }, [activeBlockchain, activeNetwork]);

  // On mount: load cache, then auto-sync in background
  useEffect(() => {
    if (!hasWallet) return;
    let cancelled = false;

    const init = async () => {
      await loadAddresses(activeBlockchain, activeNetwork);
      await loadUTXOs(activeBlockchain, activeNetwork);

      const ts = await StorageAdapter.get(`last_synced_${activeBlockchain}_${activeNetwork}`);
      if (ts && !cancelled) setLastSynced(new Date(ts));

      if (!cancelled) {
        try {
          await syncFullWallet();
          if (!cancelled) await persistSync(new Date());
        } catch (err) {
          console.warn('[DashboardSync] Auto-sync error:', err.message);
        }
      }
    };

    init();
    return () => { cancelled = true; };
  }, [hasWallet, activeBlockchain, activeNetwork]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleManualSync = useCallback(async () => {
    try {
      await syncFullWallet();
      await persistSync(new Date());
    } catch (err) {
      console.warn('[DashboardSync] Manual sync error:', err.message);
    }
  }, [syncFullWallet, persistSync]);

  return { lastSynced, handleManualSync };
}
