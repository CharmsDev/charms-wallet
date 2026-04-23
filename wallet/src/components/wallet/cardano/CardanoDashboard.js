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
import CardanoSendDialog from './CardanoSendDialog';
import CardanoPortfolioSummary from './CardanoPortfolioSummary';
import BeamBackDialog from '@/components/beam/BeamBackDialog';
import EbtcRedeemDialog from '@/components/beam/EbtcRedeemDialog';
import ReceiveBitcoinDialog from '@/components/wallet/dashboard/components/ReceiveBitcoinDialog';

export default function CardanoDashboard() {
  const { seedPhrase } = useWallet();
  const { activeNetwork, isCardano } = useBlockchain();
  const {
    addresses, adaBalance, assets, isRefreshing, initialized, error,
    pendingCreditLovelace, pendingSendTxHash,
    deriveAddresses, refresh,
  } = useCardano();

  const { loadFromStorage } = useCardano();
  const initRef = useRef(null);
  const [beamBackAsset, setBeamBackAsset] = useState(null);
  const [redeemAsset, setRedeemAsset] = useState(null);
  const [sendAdaOpen, setSendAdaOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [sendCntAsset, setSendCntAsset] = useState(null);

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

  const pendingCredit = BigInt(pendingCreditLovelace || '0');
  const totalLovelace = BigInt(adaBalance || '0') + pendingCredit;
  const adaDisplay = initialized
    ? (Number(totalLovelace) / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })
    : '—';
  const pendingDisplay = pendingCredit > 0n
    ? (Number(pendingCredit) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 })
    : null;

  return (
    <div className="space-y-6">
      {/* Two-column grid matching Bitcoin dashboard proportions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left (2/3): Balance + actions + addresses */}
        <div className="lg:col-span-2 card p-6 space-y-5">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold gradient-text">Cardano Wallet</h2>
            <button
              onClick={refresh}
              disabled={isRefreshing}
              className="glass-effect p-2 rounded-md hover:bg-dark-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={isRefreshing ? 'Refreshing...' : 'Refresh balance'}
            >
              <svg
                className={`w-5 h-5 text-dark-300 ${isRefreshing ? 'animate-spin' : ''}`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
              </svg>
            </button>
          </div>

          {/* Balance row: amount left, compact action buttons right */}
          <div className="glass-effect rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="text-xs text-dark-400 mb-1">Total Balance</div>
              <div className="text-3xl font-bold text-white leading-tight">
                {adaDisplay}
                <span className="text-lg text-dark-400 ml-2">ADA</span>
              </div>
              {!initialized && !isRefreshing && (
                <div className="text-xs text-dark-500 mt-1">Not yet loaded</div>
              )}
              {pendingDisplay && (
                <div className="text-xs text-yellow-400 mt-1">
                  {pendingDisplay} ADA confirming (send in mempool)
                </div>
              )}
            </div>
            <div className="flex gap-2 sm:flex-shrink-0">
              <button
                onClick={() => setSendAdaOpen(true)}
                disabled={!initialized || !addresses?.length}
                className="btn btn-primary px-4 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send
              </button>
              <button
                onClick={() => setReceiveOpen(true)}
                disabled={!addresses?.length}
                className="btn btn-secondary px-4 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Receive
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3 text-xs text-red-400">
              {error}
            </div>
          )}

          {/* Addresses */}
          <div className="space-y-0">
            {addresses.map((addr) => (
              <CardanoAddressCard key={addr.address} addr={addr} network={activeNetwork} />
            ))}
          </div>
        </div>

        {/* Right (1/3): Portfolio Summary */}
        <div>
          <CardanoPortfolioSummary />
        </div>
      </div>

      {/* Native Assets — full width below */}
      {initialized && assets.length > 0 && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold gradient-text mb-4">
            Native Assets ({assets.length})
          </h3>
          <CardanoAssetList
            assets={assets}
            onBeamBack={handleBeamBack}
            onRedeem={handleRedeem}
            onTransfer={setSendCntAsset}
          />
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

      <CardanoSendDialog
        isOpen={sendAdaOpen}
        onClose={() => setSendAdaOpen(false)}
        mode="ada"
      />

      <CardanoSendDialog
        isOpen={!!sendCntAsset}
        onClose={() => setSendCntAsset(null)}
        mode="cnt"
        asset={sendCntAsset}
      />

      <ReceiveBitcoinDialog
        isOpen={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        assetName="ADA"
      />
    </div>
  );
}
