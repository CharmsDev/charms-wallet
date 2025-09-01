'use client';

import { useState, useEffect, useMemo } from 'react';
import { useCharms } from '@/stores/charmsStore';
import { useBlockchain } from '@/stores/blockchainStore';

export default function BalanceDisplay({ balance, btcPrice, priceLoading, isLoading, network }) {
    const [showUSD, setShowUSD] = useState(false);
    const [trend, setTrend] = useState(null);
    const { charms, loadCharms, isLoading: charmsLoading, initialized } = useCharms();
    const { activeBlockchain, activeNetwork } = useBlockchain();

    // Format balance in BTC
    const formatBTC = (satoshis) => {
        const btc = satoshis / 100000000;
        return btc.toFixed(8);
    };

    // Format balance in fiat
    const formatFiat = (satoshis, currency = 'usd') => {
        if (!btcPrice || priceLoading) return '---';
        const btc = satoshis / 100000000;
        const fiatValue = btc * btcPrice[currency];
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency.toUpperCase(),
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(fiatValue);
    };

    // Memoize BRO token balance calculation to prevent redundant processing
    const broBalance = useMemo(() => {
        
        // Sum all BRO tokens across multiple charms - use enhanced data if available
        const broCharms = charms.filter(charm => {
            const isBro = charm.isBroToken || 
                         charm.amount?.ticker === 'CHARMS-TOKEN' || 
                         charm.amount?.ticker === '$BRO' ||
                         charm.amount?.name?.toLowerCase().includes('bro');
            return isBro;
        });
        
        const totalBalance = broCharms.reduce((total, charm) => {
            let charmBalance = 0;
            
            // Use displayAmount directly - it's already properly converted
            if (charm.displayAmount) {
                charmBalance = parseFloat(charm.displayAmount);
            } else if (charm.amount?.remaining) {
                const remainingValue = parseFloat(charm.amount.remaining);
                if (remainingValue > 1000) {
                    // Large raw number needs conversion
                    charmBalance = remainingValue / Math.pow(10, 8);
                } else {
                    // Already converted
                    charmBalance = remainingValue;
                }
            }
            
            return total + charmBalance;
        }, 0);
        
        return totalBalance;
    }, [charms]); // Only recalculate when charms array changes

    // Load charms when wallet is initialized or network changes
    useEffect(() => {
        if (activeBlockchain && activeNetwork && initialized && !charmsLoading) {
            if (charms.length === 0) {
                loadCharms();
            }
        }
    }, [activeBlockchain, activeNetwork, initialized, charmsLoading, charms.length]);

    // Force balance recalculation when charms change
    useEffect(() => {
        if (charms.length > 0) {
        }
    }, [charms]);

    useEffect(() => {
        if (btcPrice && !priceLoading) {
            const mockTrend = (Math.random() - 0.5) * 10;
            setTrend(mockTrend);
        }
    }, [btcPrice, priceLoading]);

    const toggleCurrency = () => {
        setShowUSD(!showUSD);
    };

    return (
        <div className="card p-6 space-y-6">
            <div className="flex justify-between items-start">
                <div>
                    <h2 className="text-lg font-semibold text-dark-300 mb-1">Portfolio Balance</h2>
                    <div className="flex items-center space-x-2">
                        <div className={`w-2 h-2 rounded-full ${network === 'mainnet' ? 'bg-green-500' : 'bg-orange-500'}`}></div>
                        <span className="text-sm text-dark-400 capitalize">{network}</span>
                    </div>
                </div>
                {trend !== null && (
                    <div className={`flex items-center space-x-1 text-sm ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        <span>{trend >= 0 ? '↗' : '↘'}</span>
                        <span>{Math.abs(trend).toFixed(2)}%</span>
                        <span className="text-dark-500">24h</span>
                    </div>
                )}
            </div>

            {isLoading ? (
                <div className="space-y-4">
                    <div className="h-16 bg-dark-700 rounded animate-pulse"></div>
                    <div className="h-16 bg-dark-700 rounded animate-pulse"></div>
                    <div className="h-6 bg-dark-700 rounded w-1/2 animate-pulse"></div>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Dual Token Display */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Bitcoin Balance */}
                        <div className="glass-effect p-4 rounded-xl border border-dark-600">
                            <div className="flex items-center space-x-2 mb-2">
                                <div className="w-6 h-6 rounded-full bg-gradient-to-r from-orange-500 to-yellow-500 flex items-center justify-center">
                                    <span className="text-xs font-bold text-white">₿</span>
                                </div>
                                <span className="text-sm font-medium text-dark-300">Bitcoin</span>
                            </div>
                            <div 
                                className="cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={toggleCurrency}
                            >
                                <div className="text-2xl font-bold gradient-text mb-1">
                                    {showUSD ? formatFiat(balance) : `${formatBTC(balance)} BTC`}
                                </div>
                                <div className="text-sm text-dark-400">
                                    {showUSD ? `${formatBTC(balance)} BTC` : formatFiat(balance)}
                                </div>
                            </div>
                        </div>

                        {/* Bro Token Balance */}
                        <div className="glass-effect p-4 rounded-xl border border-dark-600">
                            <div className="flex items-center space-x-2 mb-2">
                                <div className="w-6 h-6 rounded-full overflow-hidden">
                                    <img 
                                        src="https://bro.charms.dev/assets/bro-token-DsXLIv23.jpg" 
                                        alt="Bro Token" 
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            e.target.style.display = 'none';
                                            e.target.nextSibling.style.display = 'flex';
                                        }}
                                    />
                                    <div className="w-6 h-6 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center" style={{display: 'none'}}>
                                        <span className="text-xs font-bold text-white">B</span>
                                    </div>
                                </div>
                                <span className="text-sm font-medium text-dark-300">Bro</span>
                            </div>
                            <div className="text-2xl font-bold text-purple-400 mb-1">
                                {charmsLoading ? (
                                    <div className="h-8 bg-dark-700 rounded animate-pulse w-24"></div>
                                ) : (
                                    `${broBalance.toFixed(2)} $BRO`
                                )}
                            </div>
                            <div className="text-sm text-dark-400">
                                {charmsLoading ? 'Loading...' : (broBalance > 0 ? 'Token Balance' : 'No tokens')}
                            </div>
                        </div>
                    </div>

                </div>
            )}

            {/* Price Info */}
            {!priceLoading && btcPrice && (
                <div className="flex justify-between items-center text-sm text-dark-400 pt-2 border-t border-dark-700">
                    <span>BTC Price:</span>
                    <div className="flex space-x-4">
                        <span>${btcPrice.usd?.toLocaleString()}</span>
                        <span>€{btcPrice.eur?.toLocaleString()}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
