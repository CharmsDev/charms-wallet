'use client';

import { useState, useEffect, useMemo } from 'react';
import { useCharms } from '@/stores/charmsStore';
import { useUTXOs } from '@/stores/utxoStore';
import { getBroTokenAppId } from '@/services/charms/charms-explorer-api';
import { useBlockchain } from '@/stores/blockchainStore';

export default function BalanceDisplay({ balance, pendingBalance, btcPrice, priceLoading, isLoading, network, onRefresh, isRefreshing, refreshProgress }) {
    const [showUSD, setShowUSD] = useState(false);
    const [trend, setTrend] = useState(null);
    const { charms, getTotalByAppId, isLoading: charmsLoading } = useCharms();
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

    // UNIFIED BRO token balance calculation using store function
    // This ensures consistency with Charms tab and other components
    const broBalance = useMemo(() => {
        const targetId = getBroTokenAppId();
        const balance = getTotalByAppId(targetId);
        return balance;
    }, [charms, getTotalByAppId]); // Recalculate when charms change

    // Charms are now auto-initialized by useCharms hook
    // No manual loading needed

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
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-lg font-semibold text-dark-300 mb-1">Portfolio Balance</h2>
                    <div className="flex items-center space-x-2">
                        <div className={`w-2 h-2 rounded-full ${network === 'mainnet' ? 'bg-green-500' : 'bg-orange-500'}`}></div>
                        <span className="text-sm text-dark-400 capitalize">{network}</span>
                    </div>
                </div>
                <div className="flex items-center space-x-4">
                    {trend !== null && (
                        <div className={`flex items-center space-x-1 text-sm ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            <span>{trend >= 0 ? '↗' : '↘'}</span>
                            <span>{Math.abs(trend).toFixed(2)}%</span>
                            <span className="text-dark-500">24h</span>
                        </div>
                    )}
                    <button
                        onClick={onRefresh}
                        disabled={isRefreshing}
                        className="glass-effect p-2 rounded-md hover:bg-dark-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title={isRefreshing ? 
                            (refreshProgress?.isRefreshing && refreshProgress?.total > 0 ? 
                                `Scanning addresses: ${refreshProgress.processed}/${refreshProgress.total}` : 
                                "Refreshing UTXOs, addresses and charms...") : 
                            "Refresh balances (scans 24 addresses)"}
                    >
                        <svg
                            className={`w-6 h-6 text-dark-300 ${isRefreshing ? 'animate-spin' : ''}`}
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
                        </svg>
                    </button>
                </div>
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
                                <span className="text-sm font-medium text-dark-300">Bitcoin Available</span>
                            </div>
                            <div 
                                className="cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={toggleCurrency}
                            >
                                <div className="text-2xl font-bold gradient-text mb-1">
                                    {isRefreshing ? (
                                        <div className="h-8 bg-dark-700 rounded animate-pulse w-32"></div>
                                    ) : (
                                        showUSD ? formatFiat(balance) : `${formatBTC(balance)} BTC`
                                    )}
                                </div>
                                {!isRefreshing && (
                                    <div className="text-xs text-orange-400 mb-1">
                                        {pendingBalance > 0 ? `+${formatBTC(pendingBalance)} BTC pending` : 'No BTC pending'}
                                    </div>
                                )}
                                <div className="text-sm text-dark-400">
                                    {isRefreshing ? 'Loading...' : (showUSD ? `${formatBTC(balance)} BTC` : formatFiat(balance))}
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
                            {!charmsLoading && (
                                <div className="text-xs text-orange-400 mb-1">
                                    No $BRO pending
                                </div>
                            )}
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
