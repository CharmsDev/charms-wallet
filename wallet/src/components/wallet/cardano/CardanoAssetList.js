'use client';

/**
 * Cardano native asset list — shows CNTs, proxy tokens, NFTs.
 * Renders a grid of asset cards similar to CharmsList.
 */

import CardanoAssetCard from './CardanoAssetCard';

export default function CardanoAssetList({ assets, onBeamBack, onRedeem, onTransfer }) {
  if (!assets.length) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {assets.map(asset => (
        <CardanoAssetCard
          key={asset.unit}
          asset={asset}
          onBeamBack={onBeamBack}
          onRedeem={onRedeem}
          onTransfer={onTransfer}
        />
      ))}
    </div>
  );
}
