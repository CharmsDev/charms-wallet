/**
 * Cardano popup home content (popup-sized variant of wallet's
 * CardanoDashboard). Renders:
 *   - the user's primary Cardano address with a copy button
 *   - ADA balance card
 *   - quick stats (UTXO count, asset count)
 *   - top 3 CNT assets (link to AssetsScreen for full list)
 *
 * State comes entirely from @/stores/cardanoStore (wallet's Zustand
 * store) via the @/ alias. Bootstrap happens in useCardanoBootstrap
 * (mounted by ExtensionDashboard) so by the time this renders the
 * store may still be loading; we show skeletons.
 */

import { useState } from 'react';
import { useCardano } from '@/stores/cardanoStore';
import BeamBackDialog from '@/components/beam/BeamBackDialog';
import EbtcRedeemDialog from '@/components/beam/EbtcRedeemDialog';
import BeamPanelPopup from '../beam/BeamPanelPopup';

const BRO_POLICY  = 'b8f72e95dee612df98ac5a90b7604f7815c2af07a6db209a5c70abe4';
const EBTC_POLICY = '552b22f4989ea698fabbf6314b70d2e5edb49c1fdbdeb6096e8c84b6';

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="text-xs text-dark-400 hover:text-white p-1"
      title="Copy"
    >
      {copied ? '✓' : '⧉'}
    </button>
  );
}

function AddressRow({ address }) {
  if (!address) return null;
  return (
    <div className="card p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-dark-400">Cardano address</span>
        <CopyButton value={address} />
      </div>
      <code className="text-[10px] font-mono text-cardano-400 break-all leading-tight mt-1 block">
        {address.slice(0, 18)}…{address.slice(-12)}
      </code>
    </div>
  );
}

function AdaBalanceCard({ adaBalance, isRefreshing }) {
  const ada = Number(BigInt(adaBalance || '0')) / 1_000_000;
  return (
    <div className="card p-4 bg-gradient-to-br from-cardano-900/40 to-dark-900 border-cardano-700/30">
      <div className="flex items-center justify-between">
        <span className="text-xs text-dark-300">ADA balance</span>
        {isRefreshing && (
          <span className="text-[10px] text-dark-400">refreshing…</span>
        )}
      </div>
      <p className="text-2xl font-bold text-cardano-300 mt-1">
        {ada.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
      </p>
      <p className="text-[10px] text-dark-500 mt-1">ADA</p>
    </div>
  );
}

function StatsRow({ utxoCount, assetCount }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="card p-3">
        <p className="text-[10px] text-dark-400">UTXOs</p>
        <p className="text-lg font-semibold text-white">{utxoCount}</p>
      </div>
      <div className="card p-3">
        <p className="text-[10px] text-dark-400">Native assets (CNT)</p>
        <p className="text-lg font-semibold text-white">{assetCount}</p>
      </div>
    </div>
  );
}

function AssetPreview({ assets, onViewAll }) {
  const top = assets.slice(0, 3);
  if (!top.length) {
    return (
      <div className="card p-3 text-center">
        <p className="text-xs text-dark-400">No native assets yet</p>
      </div>
    );
  }
  return (
    <div className="card">
      <div className="flex items-center justify-between p-3 border-b border-dark-700">
        <span className="text-sm font-medium text-white">Assets</span>
        <button onClick={onViewAll} className="text-xs text-cardano-400 hover:text-cardano-300">
          View All →
        </button>
      </div>
      <div className="p-2 space-y-1">
        {top.map((a) => {
          const decimals = a.decimals || 0;
          const quantity = decimals > 0
            ? (Number(BigInt(a.quantity)) / Math.pow(10, decimals)).toLocaleString(undefined, {
                maximumFractionDigits: decimals,
              })
            : a.quantity;
          return (
            <div key={a.unit} className="flex items-center justify-between p-2 hover:bg-dark-800/50 rounded">
              <div className="min-w-0">
                <p className="text-sm text-white truncate">{a.name || a.assetName?.slice(0, 16) || 'Token'}</p>
                <p className="text-[10px] text-dark-500 font-mono truncate">
                  {a.ticker || a.unit.slice(0, 18) + '…'}
                </p>
              </div>
              <span className="text-sm font-mono text-cardano-400">{quantity}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CardanoHomeContent({ onViewAllAssets }) {
  const addresses = useCardano(s => s.addresses);
  const adaBalance = useCardano(s => s.adaBalance);
  const assets = useCardano(s => s.assets);
  const utxos = useCardano(s => s.utxos);
  const isRefreshing = useCardano(s => s.isRefreshing);
  const initialized = useCardano(s => s.initialized);

  const [assetToBeamBack, setAssetToBeamBack] = useState(null);
  const [assetToRedeem, setAssetToRedeem] = useState(null);
  const primary = addresses?.[0]?.address || '';

  // Two policies that have direct entry buttons in the popup:
  //   BRO  → BeamBackDialog  (charm transfer / beam-back)
  //   eBTC → EbtcRedeemDialog (BTC vault release)
  const broAsset  = (assets || []).find((a) => a.policyId === BRO_POLICY);
  const ebtcAsset = (assets || []).find((a) => a.policyId === EBTC_POLICY);

  return (
    <div className="p-4 space-y-3">
      <AddressRow address={primary} />
      <AdaBalanceCard adaBalance={adaBalance} isRefreshing={isRefreshing} />
      <StatsRow utxoCount={utxos?.length ?? 0} assetCount={assets?.length ?? 0} />

      {broAsset && BigInt(broAsset.quantity || '0') > 0n && (
        <button
          onClick={() => setAssetToBeamBack(broAsset)}
          className="w-full py-3 rounded-lg bg-gradient-to-r from-cardano-600 to-purple-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          ↗ Beam BRO back to Bitcoin
        </button>
      )}

      {ebtcAsset && BigInt(ebtcAsset.quantity || '0') > 0n && (
        <button
          onClick={() => setAssetToRedeem(ebtcAsset)}
          className="w-full py-3 rounded-lg bg-gradient-to-r from-cardano-600 to-orange-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          🔓 Redeem eBTC to Bitcoin
        </button>
      )}

      <BeamPanelPopup />

      <AssetPreview assets={assets || []} onViewAll={onViewAllAssets} />

      <div className="card p-3 bg-blue-900/20 border-blue-700/30">
        <p className="text-[11px] text-blue-300">
          Native ADA / CNT send from the popup is tracked for a follow-up;
          beam-back works today via the button above.
        </p>
      </div>

      {!initialized && (
        <div className="text-center text-xs text-dark-500 py-4">
          Loading Cardano data…
        </div>
      )}

      {/* BRO beam-back dialog (ADA → BTC). Wallet's BeamBackDialog runs
          the same form/confirm wizard the web wallet uses. The execution
          is driven by BeamOperationsContext mounted at ExtensionApp. */}
      {assetToBeamBack && (
        <BeamBackDialog
          asset={assetToBeamBack}
          isOpen={true}
          onClose={() => setAssetToBeamBack(null)}
        />
      )}

      {/* eBTC redeem dialog (burn eBTC CNT on Cardano → vault releases
          BTC on Bitcoin). Wallet's EbtcRedeemDialog handles the wizard;
          executeEbtcRedeem runs the multi-step on-chain flow. */}
      {assetToRedeem && (
        <EbtcRedeemDialog
          asset={assetToRedeem}
          onClose={() => setAssetToRedeem(null)}
        />
      )}
    </div>
  );
}
