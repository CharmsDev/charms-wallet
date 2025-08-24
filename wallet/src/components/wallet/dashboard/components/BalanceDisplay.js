'use client';

import { useState, useEffect } from 'react';

export default function BalanceDisplay({ balance, btcPrice, priceLoading, isLoading, network }) {
    const [showUSD, setShowUSD] = useState(true);
    const [trend, setTrend] = useState(null);

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

    // Mock 24h trend (in production, this would come from price history)
    useEffect(() => {
        if (btcPrice && !priceLoading) {
            // Simulate a small random trend for demo
            const mockTrend = (Math.random() - 0.5) * 10; // -5% to +5%
            setTrend(mockTrend);
        }
    }, [btcPrice, priceLoading]);

    const toggleCurrency = () => {
        setShowUSD(!showUSD);
    };

    return (
        <div className="card p-6 space-y-4">
            <div className="flex justify-between items-start">
                <div>
                    <h2 className="text-lg font-semibold text-dark-300 mb-1">Total Balance</h2>
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
                <div className="space-y-3">
                    <div className="h-12 bg-dark-700 rounded animate-pulse"></div>
                    <div className="h-6 bg-dark-700 rounded w-1/2 animate-pulse"></div>
                </div>
            ) : (
                <div className="space-y-2">
                    {/* Primary Balance Display */}
                    <div 
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={toggleCurrency}
                    >
                        <div className="text-4xl font-bold gradient-text">
                            {showUSD ? formatFiat(balance) : `${formatBTC(balance)} BTC`}
                        </div>
                    </div>

                    {/* Secondary Balance Display */}
                    <div 
                        className="text-lg text-dark-400 cursor-pointer hover:text-dark-300 transition-colors"
                        onClick={toggleCurrency}
                    >
                        {showUSD ? `${formatBTC(balance)} BTC` : formatFiat(balance)}
                    </div>

                    {/* Balance Breakdown */}
                    <div className="flex justify-between items-center pt-4 border-t border-dark-700">
                        <div className="text-sm">
                            <span className="text-dark-400">Available:</span>
                            <span className="text-white ml-2">{formatBTC(balance)} BTC</span>
                        </div>
                        <div className="text-sm">
                            <span className="text-dark-400">Pending:</span>
                            <span className="text-white ml-2">0.00000000 BTC</span>
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
