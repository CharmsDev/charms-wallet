'use client';

export default function PortfolioSummary({ utxos, charms, addresses, isLoading }) {
    // Calculate portfolio stats
    const getPortfolioStats = () => {
        const utxoCount = Object.keys(utxos || {}).length;
        const utxoValue = Object.values(utxos || {}).reduce((total, utxo) => total + (utxo.value || 0), 0);
        
        const charmsCount = charms?.length || 0;
        const charmsValue = charms?.reduce((total, charm) => total + (charm.value || 0), 0) || 0;
        
        const addressCount = addresses?.length || 0;
        const usedAddresses = addresses?.filter(addr => addr.used)?.length || 0;
        
        return {
            utxoCount,
            utxoValue,
            charmsCount,
            charmsValue,
            addressCount,
            usedAddresses
        };
    };

    const stats = getPortfolioStats();

    const formatBTC = (satoshis) => {
        const btc = satoshis / 100000000;
        return btc.toFixed(8);
    };

    const portfolioCards = [
        {
            title: 'UTXOs',
            value: stats.utxoCount,
            subtitle: `${formatBTC(stats.utxoValue)} BTC`,
            icon: '💰',
            color: 'text-bitcoin-400'
        },
        {
            title: 'Charms',
            value: stats.charmsCount,
            subtitle: stats.charmsValue > 0 ? `${formatBTC(stats.charmsValue)} BTC` : 'No value',
            icon: '✨',
            color: 'text-purple-400'
        },
        {
            title: 'Addresses',
            value: stats.addressCount,
            subtitle: `${stats.usedAddresses} used`,
            icon: '📍',
            color: 'text-blue-400'
        }
    ];

    return (
        <div className="card p-6">
            <h3 className="text-lg font-semibold gradient-text mb-4">Portfolio Summary</h3>
            
            {isLoading ? (
                <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="glass-effect p-4 rounded-lg">
                            <div className="flex items-center justify-between">
                                <div className="space-y-2">
                                    <div className="h-4 bg-dark-700 rounded w-16 animate-pulse"></div>
                                    <div className="h-6 bg-dark-700 rounded w-12 animate-pulse"></div>
                                    <div className="h-3 bg-dark-700 rounded w-20 animate-pulse"></div>
                                </div>
                                <div className="h-8 w-8 bg-dark-700 rounded animate-pulse"></div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="space-y-4">
                    {portfolioCards.map((card, index) => (
                        <div key={index} className="glass-effect p-4 rounded-lg hover:bg-dark-800/50 transition-colors">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-dark-400 mb-1">{card.title}</p>
                                    <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
                                    <p className="text-xs text-dark-500">{card.subtitle}</p>
                                </div>
                                <div className="text-2xl opacity-60">{card.icon}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Network Fee Recommendations */}
            <div className="mt-6 pt-4 border-t border-dark-700">
                <h4 className="text-sm font-medium text-dark-300 mb-3">Network Fees</h4>
                <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="text-center p-2 bg-dark-800 rounded">
                        <div className="text-green-400 font-medium">Low</div>
                        <div className="text-dark-400">~10 sat/vB</div>
                    </div>
                    <div className="text-center p-2 bg-dark-800 rounded">
                        <div className="text-yellow-400 font-medium">Medium</div>
                        <div className="text-dark-400">~20 sat/vB</div>
                    </div>
                    <div className="text-center p-2 bg-dark-800 rounded">
                        <div className="text-red-400 font-medium">High</div>
                        <div className="text-dark-400">~50 sat/vB</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
