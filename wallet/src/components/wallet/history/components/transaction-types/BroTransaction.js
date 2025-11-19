'use client';

/**
 * Displays BRO token transaction details including mining/mint output information
 * Shows token metadata with image, name, ticker, and App ID in a two-column layout
 */
export default function BroTransaction({ transaction, copyToClipboard }) {
    const charmData = transaction.charmTokenData;
    const isMining = transaction.type === 'bro_mining';
    const isMint = transaction.type === 'bro_mint';

    if (!charmData) {
        return null;
    }

    return (
        <div className="glass-effect p-4 rounded-lg">
            <div className="flex gap-4 items-start">
                {charmData.tokenImage && (
                    <div className="w-1/5 flex-shrink-0">
                        <img 
                            src={charmData.tokenImage} 
                            alt={charmData.tokenName || 'BRO Token'}
                            className="w-full h-auto rounded-lg object-cover border-2 border-orange-500/30"
                            onError={(e) => { e.target.style.display = 'none'; }}
                        />
                    </div>
                )}

                <div className={charmData.tokenImage ? "flex-1" : "w-full"}>
                    <p className="text-xs text-dark-400 mb-2">Token</p>
                    
                    <div className="flex items-baseline gap-2 mb-3">
                        {charmData.tokenName && (
                            <h4 className="text-base font-semibold text-white">{charmData.tokenName}</h4>
                        )}
                        {charmData.tokenTicker && (
                            <p className="text-sm text-orange-400 font-mono">{charmData.tokenTicker}</p>
                        )}
                    </div>

                    {isMining && (
                        <div className="mb-3">
                            <p className="text-xs text-dark-400 mb-0.5">Mining Output</p>
                            <p className="text-xs text-white">
                                {transaction.outputs?.some(o => o.amount === 333) ? '333 sats' : 
                                 transaction.outputs?.some(o => o.amount === 777) ? '777 sats' : 
                                 'BRO mining'}
                            </p>
                        </div>
                    )}

                    {isMint && (
                        <div className="mb-3">
                            <p className="text-xs text-dark-400 mb-0.5">Mint Output</p>
                            <p className="text-xs text-white">
                                {transaction.outputs?.some(o => o.amount === 330) ? '330 sats' : 
                                 transaction.outputs?.some(o => o.amount === 1000) ? '1000 sats' : 
                                 'BRO mint'}
                            </p>
                        </div>
                    )}

                    {charmData.appId && (
                        <div>
                            <p className="text-xs text-dark-400 mb-1">App ID</p>
                            <div className="flex items-start gap-2 bg-dark-800/50 p-2 rounded">
                                <code className="text-xs text-orange-400 break-all font-mono flex-1 leading-tight">
                                    {charmData.appId}
                                </code>
                                <button
                                    onClick={() => copyToClipboard(charmData.appId)}
                                    className="flex-shrink-0 p-1 hover:bg-dark-700 rounded transition-colors"
                                    title="Copy App ID"
                                >
                                    <svg className="w-3 h-3 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
