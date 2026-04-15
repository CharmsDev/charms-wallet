'use client';

/**
 * Cardano Asset View — shown in the "Charms" tab when Cardano is active.
 * Displays all native assets (CNTs, proxy tokens) with refresh capability.
 */

import { useEffect, useRef } from 'react';
import { useCardano } from '@/stores/cardanoStore';
import { useWallet } from '@/stores/walletStore';
import { useBlockchain } from '@/stores/blockchainStore';
import CardanoAssetList from './CardanoAssetList';

export default function CardanoAssetView() {
  const { seedPhrase } = useWallet();
  const { activeNetwork } = useBlockchain();
  const {
    addresses, assets, isRefreshing, initialized,
    deriveAddresses, refresh, loadFromStorage,
  } = useCardano();
  const initRef = useRef(null);

  useEffect(() => {
    if (!seedPhrase) return;
    const network = activeNetwork === 'mainnet' ? 'mainnet' : 'preprod';
    const key = `${network}-${seedPhrase.slice(0, 8)}`;
    if (initRef.current === key) return;
    initRef.current = key;

    loadFromStorage(network).then(() => {
      if (!addresses.length) {
        deriveAddresses(seedPhrase, network, 1).then(() => refresh());
      } else if (!initialized) {
        refresh();
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedPhrase, activeNetwork]);

  return (
    <div>
      <div className="p-6 flex items-center">
        <h2 className="text-xl font-bold gradient-text mr-6 hidden md:block">Cardano Assets</h2>
        <button
          onClick={refresh}
          disabled={isRefreshing}
          className="btn btn-secondary text-sm"
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {!initialized && !isRefreshing && (
        <div className="card p-6 text-center text-dark-400">
          Loading Cardano assets...
        </div>
      )}

      {initialized && assets.length > 0 && (
        <div className="p-2 md:p-4">
          <CardanoAssetList assets={assets} />
        </div>
      )}

      {initialized && assets.length === 0 && (
        <div className="card p-6 text-center text-dark-400">
          <p>No native assets found on Cardano.</p>
          <p className="text-xs mt-2">Beam BRO tokens from Bitcoin to see proxy CNTs here.</p>
        </div>
      )}
    </div>
  );
}
