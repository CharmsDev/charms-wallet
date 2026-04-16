'use client';

/**
 * Cardano Dashboard — main view when Cardano blockchain is selected.
 * Shows ADA balance, native assets (CNTs), and addresses.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useCardano } from '@/stores/cardanoStore';
import { useWallet } from '@/stores/walletStore';
import { useBlockchain } from '@/stores/blockchainStore';
import CardanoAssetList from './CardanoAssetList';
import CardanoAddressCard from './CardanoAddressCard';
import BeamBackDialog from '@/components/beam/BeamBackDialog';
import EbtcRedeemDialog from '@/components/beam/EbtcRedeemDialog';

export default function CardanoDashboard() {
  const { seedPhrase } = useWallet();
  const { activeNetwork, isCardano } = useBlockchain();
  const {
    addresses, adaBalance, assets, isRefreshing, initialized, error,
    deriveAddresses, refresh,
  } = useCardano();

  const { loadFromStorage } = useCardano();
  const initRef = useRef(null);
  const [beamBackAsset, setBeamBackAsset] = useState(null);
  const [redeemAsset, setRedeemAsset] = useState(null);

  // Handle beam-back from Cardano to Bitcoin — opens dialog
  const handleBeamBack = useCallback((asset) => {
    setBeamBackAsset(asset);
  }, []);

  const handleRedeem = useCallback((asset) => {
    // Find CNT UTXO that holds this asset (need txHash:outputIndex)
    const utxos = useCardano.getState().utxos || [];
    const cntUtxo = utxos.find(u =>
      (u.assets || []).some(a => a.unit === asset.unit)
    );
    if (cntUtxo) {
      asset._cntUtxoId = `${cntUtxo.txHash}:${cntUtxo.outputIndex}`;
    }
    setRedeemAsset(asset);
  }, []);

  // Load from storage first (instant UI), then derive + refresh from API
  useEffect(() => {
    if (!seedPhrase || !isCardano()) return;
    const network = activeNetwork === 'mainnet' ? 'mainnet' : 'preprod';
    const key = `${network}-${seedPhrase.slice(0, 8)}`;

    // Prevent re-running for same network+seed
    if (initRef.current === key) return;
    initRef.current = key;

    loadFromStorage(network).then(() => {
      deriveAddresses(seedPhrase, network, 1).then(() => {
        refresh();
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedPhrase, activeNetwork]);

  if (!isCardano()) return null;

  return (
    <div className="space-y-6">
      {/* Balance Card */}
      <div className="card p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold gradient-text">Cardano Wallet</h2>
          <button
            onClick={refresh}
            disabled={isRefreshing}
            className="btn btn-secondary text-sm"
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* ADA Balance */}
        <div className="bg-dark-900 rounded-xl p-5 mb-4">
          <div className="text-sm text-dark-400 mb-1">Total Balance</div>
          <div className="text-3xl font-bold text-white">
            {initialized ? (Number(BigInt(adaBalance || '0')) / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : '—'}
            <span className="text-lg text-dark-400 ml-2">ADA</span>
          </div>
          {!initialized && !isRefreshing && (
            <div className="text-xs text-dark-500 mt-1">Not yet loaded</div>
          )}
          {/* Send / Receive buttons */}
          <div className="flex gap-3 mt-4">
            <button disabled className="btn btn-primary flex-1 py-2.5 opacity-50 cursor-not-allowed">
              Send ADA
            </button>
            <button disabled className="btn btn-secondary flex-1 py-2.5 opacity-50 cursor-not-allowed">
              Receive
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3 text-xs text-red-400 mb-4">
            {error}
          </div>
        )}

        {/* Addresses */}
        {addresses.map((addr) => (
          <CardanoAddressCard key={addr.address} addr={addr} network={activeNetwork} />
        ))}
      </div>

      {/* Native Assets */}
      {initialized && assets.length > 0 && (
        <div className="card p-6">
          <h3 className="text-lg font-bold gradient-text mb-4">
            Native Assets ({assets.length})
          </h3>
          <CardanoAssetList assets={assets} onBeamBack={handleBeamBack} onRedeem={handleRedeem} />
        </div>
      )}

      {initialized && assets.length === 0 && (
        <div className="card p-6 text-center text-dark-400 text-sm">
          No native assets found. Beam BRO from Bitcoin to see proxy CNTs here.
        </div>
      )}

      {beamBackAsset && (
        <BeamBackDialog
          asset={beamBackAsset}
          isOpen={!!beamBackAsset}
          onClose={() => setBeamBackAsset(null)}
        />
      )}

      {redeemAsset && (
        <EbtcRedeemDialog
          asset={redeemAsset}
          onClose={() => setRedeemAsset(null)}
        />
      )}
    </div>
  );
}
