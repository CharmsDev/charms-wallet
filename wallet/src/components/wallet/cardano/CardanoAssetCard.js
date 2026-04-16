'use client';

/**
 * Single Cardano native asset card.
 * Displays token name, quantity, policy ID, and links to explorer.
 * Detects Charms proxy CNTs by CIP-67 label prefix (0014df10).
 */

import { useState } from 'react';

const CIP67_TOKEN_LABEL = '0014df10';
const EBTC_POLICY_ID = '552b22f4989ea698fabbf6314b70d2e5edb49c1fdbdeb6096e8c84b6';

export default function CardanoAssetCard({ asset, onBeamBack, onRedeem }) {
  const [imageError, setImageError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const placeholderImage = 'https://charms.dev/_astro/logo-charms-dark.Ceshk2t3.png';

  // Detect Charms proxy CNTs by CIP-67 label prefix
  const isCharmsProxy = asset.assetName?.startsWith(CIP67_TOKEN_LABEL);
  const decimals = asset.decimals ?? 0;
  const displayName = asset.name;
  const displayTicker = asset.ticker;
  const description = asset.description;

  const divisor = Math.pow(10, decimals);
  const displayQty = (Number(BigInt(asset.quantity)) / divisor).toLocaleString(undefined, {
    maximumFractionDigits: decimals,
  });

  const explorerUrl = `https://cardanoscan.io/token/${asset.fingerprint || asset.unit}`;

  return (
    <div className="card card-hover flex flex-col h-full">
      {/* Image */}
      <div className="w-full h-36 bg-dark-800 overflow-hidden flex items-center justify-center">
        {asset.image && !imageError ? (
          <img
            src={asset.image.startsWith('ipfs://') ? `https://ipfs.io/ipfs/${asset.image.slice(7)}` : asset.image}
            alt={displayName}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <img src={placeholderImage} alt={displayName} className="h-16 w-auto opacity-30" />
        )}
      </div>

      <div className="p-4 flex-grow flex flex-col">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-bold text-white text-sm">{displayName}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-cardano-500/20 text-cardano-400">
                CNT
              </span>
              {isCharmsProxy && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-900/30 text-purple-400 border border-purple-500/20">
                  Charms Proxy
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <span className={`text-lg font-bold ${isCharmsProxy ? 'text-purple-400' : 'text-cardano-400'}`}>
              {displayQty}
            </span>
            {displayTicker && (
              <p className="text-xs text-dark-300">{displayTicker}</p>
            )}
          </div>
        </div>

        {description && (
          <p className="text-xs text-dark-400 mt-2 line-clamp-2">{description}</p>
        )}

        {/* Expandable details */}
        <div className="mt-auto pt-3 border-t border-dark-700">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-dark-400 hover:text-white transition-colors w-full text-left"
          >
            {expanded ? 'Hide details' : 'Show details'}
          </button>

          {expanded && (
            <div className="mt-2 space-y-1 text-xs text-dark-500 font-mono break-all">
              <div><span className="text-dark-400">Policy:</span> {asset.policyId}</div>
              <div><span className="text-dark-400">Asset:</span> {asset.assetName}</div>
              {asset.fingerprint && (
                <div><span className="text-dark-400">Fingerprint:</span> {asset.fingerprint}</div>
              )}
              {isCharmsProxy && (
                <div className="text-purple-400 mt-1">Beamed from Bitcoin via Charms protocol</div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        {isCharmsProxy && (
          <div className="mt-2">
            {asset.policyId === EBTC_POLICY_ID && onRedeem ? (
              <button
                onClick={() => onRedeem(asset)}
                className="w-full py-1.5 rounded text-xs font-medium bg-gradient-to-r from-orange-600 to-yellow-600 hover:from-orange-700 hover:to-yellow-700 text-white transition-all"
                title="Move eBTC back to Bitcoin"
              >
                Redeem to Bitcoin
              </button>
            ) : onBeamBack && (
              <button
                onClick={() => onBeamBack(asset)}
                className="w-full py-1.5 rounded text-xs font-medium bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white transition-all"
              >
                Beam to Bitcoin
              </button>
            )}
          </div>
        )}

        {/* Explorer link */}
        <div className="mt-2 flex justify-end">
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary-400 hover:underline"
          >
            CardanoScan
          </a>
        </div>
      </div>
    </div>
  );
}
