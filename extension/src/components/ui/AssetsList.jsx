const BRO_IMAGE = 'https://bro.charms.dev/assets/bro-token-DsXLIv23.jpg';

function TokenRow({ token, isSyncing }) {
  const isBro = token.ticker === '$BRO' || token.ticker === 'BRO';
  return (
    <div className="card p-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center bg-dark-700">
          {token.image_url ? (
            <img src={token.image_url} alt={token.ticker || 'Token'} className="w-full h-full object-cover" />
          ) : isBro ? (
            <img src={BRO_IMAGE} alt="BRO" className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-bold text-white">{(token.ticker || 'T')[0]}</span>
          )}
        </div>
        <div>
          <div className="text-sm font-medium text-white">{token.ticker || 'Token'}</div>
          <div className="text-xs text-dark-500">{token.app_id?.slice(0, 20)}...</div>
        </div>
      </div>
      <div className="text-sm font-bold text-white">
        {isSyncing ? '--' : Number(token.totalAmount || 0).toFixed(4)}
      </div>
    </div>
  );
}

function NFTRow({ nft }) {
  return (
    <div className="card p-3 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center overflow-hidden">
        {nft.image_url
          ? <img src={nft.image_url} alt="" className="w-full h-full object-cover" />
          : <span className="text-sm font-bold text-white">N</span>
        }
      </div>
      <div>
        <div className="text-sm font-medium text-white">{nft.name || 'NFT'}</div>
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
