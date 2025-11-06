'use client';

import { useBlockchain } from '@/stores/blockchainStore';
import { getBalance } from '@/services/storage';
import { useState, useEffect } from 'react';

export default function PortfolioSummary({ utxos, charms, addresses, isLoading }) {
    const { activeBlockchain, activeNetwork } = useBlockchain();
    const [balanceData, setBalanceData] = useState(null);

    // Load balance data from localStorage (unified structure)
    useEffect(() => {
        const data = getBalance(activeBlockchain, activeNetwork);
        setBalanceData(data);
    }, [activeBlockchain, activeNetwork, utxos, charms]); // Reload when UTXOs or charms change

    // Calculate portfolio statistics from unified structure
    const getPortfolioStats = () => {
        if (balanceData) {
            return {
                spendable: balanceData.bitcoin?.spendable || 0,
                pending: balanceData.bitcoin?.pending || 0,
                nonSpendable: balanceData.bitcoin?.nonSpendable || 0,
                utxoCount: balanceData.counts?.utxos || 0,
                charmsCount: balanceData.counts?.charms || 0,
                ordinalCount: balanceData.counts?.ordinals || 0,
                runeCount: balanceData.counts?.runes || 0
            };
        }
        
        // Fallback calculation if balance not cached
        const utxoCount = Object.keys(utxos || {}).length;
        const charmsCount = charms?.length || 0;
        
        return {
            spendable: 0,
            pending: 0,
            nonSpendable: 0,
            utxoCount,
            charmsCount,
            ordinalCount: 0,
            runeCount: 0
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
            icon: '💰',
            color: 'text-bitcoin-400'
        },
        {
            title: 'Charms',
            value: stats.charmsCount,
            icon: '✨',
            color: 'text-purple-400'
        },
        {
            title: 'Ordinals',
            value: stats.ordinalCount,
            icon: '🖼️',
            color: 'text-orange-400'
        },
        {
            title: 'Runes',
            value: stats.runeCount,
            icon: '🪙',
            color: 'text-cyan-400'
        }
    ];

    return (
        <div className="card p-6">
            <h3 className="text-lg font-semibold gradient-text mb-4">Portfolio Summary</h3>
            
            {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="glass-effect p-3 rounded-lg">
                            <div className="space-y-2">
                                <div className="h-3 bg-dark-700 rounded w-16 animate-pulse"></div>
                                <div className="h-5 bg-dark-700 rounded w-20 animate-pulse"></div>
                                <div className="h-3 bg-dark-700 rounded w-24 animate-pulse"></div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {portfolioCards.map((card, index) => (
                        <div key={index} className="glass-effect p-4 rounded-lg hover:bg-dark-800/50 transition-colors">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-dark-400 mb-1">{card.title}</p>
                                    <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
                                </div>
                                <div className="text-3xl opacity-60">{card.icon}</div>
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
