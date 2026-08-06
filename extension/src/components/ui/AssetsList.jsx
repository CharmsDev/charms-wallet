import { useState } from 'react';
import { resolveImageUrl } from '@/utils/media';

const BRO_IMAGE = 'https://bro.charms.dev/assets/bro-token-DsXLIv23.jpg';

// Field names follow the charms store contract: groupTokensByAppId()
// returns { appId, name, ticker, image, description, totalAmount,
// tokenUtxos } and getNFTs() returns charm objects with image/name.
// This file used to read `image_url` and `app_id`, which never exist on
// those objects, so every token fell through to the letter avatar and
// the id line rendered "undefined...".
function TokenRow({ token, isSyncing }) {
  const [imgError, setImgError] = useState(false);
  const isBro = token.ticker === '$BRO' || token.ticker === 'BRO';
  const image = !imgError && resolveImageUrl(token.image);
  const label = token.name || token.ticker || 'Token';

  return (
    <div className="card p-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center bg-dark-700 flex-shrink-0">
          {image ? (
            <img
              src={image}
              alt={label}
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : isBro ? (
            <img src={BRO_IMAGE} alt="BRO" className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-bold text-white">{label[0]}</span>
          )}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-white truncate">{label}</div>
          <div className="text-xs text-dark-500 truncate">
            {token.ticker && token.ticker !== label ? token.ticker : `${token.appId?.slice(0, 20) || ''}...`}
          </div>
        </div>
      </div>
      <div className="text-sm font-bold text-white flex-shrink-0 pl-2">
        {isSyncing ? '--' : Number(token.totalAmount || 0).toLocaleString()}
      </div>
    </div>
  );
}

function NFTRow({ nft }) {
  const [imgError, setImgError] = useState(false);
  const image = !imgError && resolveImageUrl(nft.image || nft.metadata?.image);
  const label = nft.name || nft.metadata?.name || 'NFT';

  return (
    <div className="card p-3 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center overflow-hidden flex-shrink-0">
        {image
          ? <img src={image} alt={label} className="w-full h-full object-cover" onError={() => setImgError(true)} />
          : <span className="text-sm font-bold text-white">N</span>
        }
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-white truncate">{label}</div>
        <div className="text-xs text-dark-500">NFT</div>
      </div>
    </div>
  );
}

export default function AssetsList({ tokens, nfts, isSyncing, isLoading, preview = false, onViewAll }) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (tokens.length === 0 && nfts.length === 0) {
    return (
      <div className={`text-center ${preview ? 'py-4 text-sm text-dark-500' : 'card p-8'}`}>
        {!preview && <div className="text-4xl mb-3">📦</div>}
        <div className="text-dark-400">{preview ? 'No assets yet' : 'No assets found'}</div>
        {!preview && <div className="text-xs text-dark-500 mt-1">Your tokens and NFTs will appear here</div>}
      </div>
    );
  }

  const visibleTokens = preview ? tokens.slice(0, 3) : tokens;
  const extra = preview ? tokens.length + nfts.length - 3 : 0;

  return (
    <div className="space-y-2">
      {visibleTokens.map((token, idx) => (
        <TokenRow key={idx} token={token} isSyncing={isSyncing} />
      ))}
      {!preview && nfts.map((nft, idx) => <NFTRow key={idx} nft={nft} />)}
      {preview && extra > 0 && (
        <button onClick={onViewAll} className="w-full text-center text-xs text-primary-400 hover:text-primary-300 py-1">
          +{extra} more →
        </button>
      )}
    </div>
  );
}
