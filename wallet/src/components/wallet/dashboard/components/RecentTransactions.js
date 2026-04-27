'use client';

import { useState, useEffect } from 'react';
import { useTransactions } from '@/stores/transactionStore';
import { useBlockchain } from '@/stores/blockchainStore';
import TransactionDetailsModal from './TransactionDetailsModal';
import { getTransactionLabel, getTransactionIcon } from '@/services/transactions/transaction-classifier';
import { formatBTC, formatTransactionDate } from '@/utils/formatters';

export default function RecentTransactions({ utxos, isLoading, onViewAllTransactions }) {
    const {
        transactions,
        isLoading: txLoading,
        loadTransactions,
        getRecentTransactions
    } = useTransactions();
    const { activeBlockchain, activeNetwork } = useBlockchain();
    const [selectedTransaction, setSelectedTransaction] = useState(null);

    const recentTransactions = getRecentTransactions(8);

    const handleTransactionClick = (tx) => {
        setSelectedTransaction(tx);
    };

    useEffect(() => {
        loadTransactions(activeBlockchain, activeNetwork);
    }, [activeBlockchain, activeNetwork, loadTransactions]);

    const getStatusColor = (status) => {
        switch (status) {
            case 'confirmed': return 'text-green-400';
            case 'pending': return 'text-yellow-400';
            case 'failed': return 'text-red-400';
            default: return 'text-dark-400';
        }
    };


    const getIconStyle = (type) => {
        switch (type) {
            case 'sent':
                return 'bg-red-500/20 text-red-400';
            case 'received':
                return 'bg-green-500/20 text-green-400';
            case 'bro_mining':
                return 'bg-orange-500/20 text-orange-400';
            case 'bro_mint':
                return 'bg-purple-500/20 text-purple-400';
            case 'charm_received':
                return 'bg-green-500/20 text-green-400';
            case 'charm_sent':
                return 'bg-red-500/20 text-red-400';
            case 'charm_transfer':
                return 'bg-blue-500/20 text-blue-400';
            case 'charm_consolidation':
                return 'bg-cyan-500/20 text-cyan-400';
            case 'charm_self_transfer':
                return 'bg-blue-500/20 text-blue-400';
            default:
                return 'bg-dark-500/20 text-dark-400';
        }
    };

    // Check if transaction is a charm transaction
    const isCharmTransaction = (tx) => {
        return ['charm_received', 'charm_sent', 'charm_transfer', 'charm_consolidation', 'charm_self_transfer', 'bro_mint', 'bro_mining'].includes(tx.type);
    };

    return (
        <div className="card p-6">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold gradient-text">Recent Transactions</h3>
                {/* Refresh handled by the dashboard's main Refresh button (it
                    runs the same balance + tx history sync). Keeping a button
                    here would be a redundant second trigger on the same screen. */}
            </div>

            {isLoading || txLoading ? (
                <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="flex items-center justify-between p-3 glass-effect rounded-lg">
                            <div className="flex items-center space-x-3">
                                <div className="h-8 w-8 bg-dark-700 rounded-full animate-pulse"></div>
                                <div className="space-y-2">
                                    <div className="h-4 bg-dark-700 rounded w-24 animate-pulse"></div>
                                    <div className="h-3 bg-dark-700 rounded w-16 animate-pulse"></div>
                                </div>
                            </div>
                            <div className="text-right space-y-2">
                                <div className="h-4 bg-dark-700 rounded w-20 animate-pulse"></div>
                                <div className="h-3 bg-dark-700 rounded w-12 animate-pulse"></div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : transactions.length === 0 ? (
                <div className="text-center py-8 text-dark-400">
                    <div className="text-4xl mb-2">📭</div>
                    <p>No transactions yet</p>
                    <p className="text-sm mt-1">Send or receive Bitcoin to see transactions here</p>
                </div>
            ) : (
                <>
                    <div className="space-y-2">
                        {recentTransactions.map((tx) => (
                            <div
                                key={tx.id}
                                onClick={() => handleTransactionClick(tx)}
                                className="p-3 glass-effect rounded-lg hover:bg-dark-800/50 transition-colors cursor-pointer"
                                title="Click to view transaction details"
                            >
                                {/* Mobile-first responsive layout */}
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                    {/* Left section: Icon + Transaction info */}
                                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${getIconStyle(tx.type)}`}>
                                            {getTransactionIcon(tx.type)}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <p className="font-medium text-white">{getTransactionLabel(tx.type)}</p>
                                                {/* Show charm token ticker if available */}
                                                {tx.charmTokenData?.tokenTicker && (
                                                    <>
                                                        <span className="text-dark-500">•</span>
                                                        <span className="text-sm font-semibold text-primary-400">
                                                            {tx.charmTokenData.tokenTicker}
                                                        </span>
                                                    </>
                                                )}
                                                <span className="text-dark-500">•</span>
                                                <p className="text-sm text-dark-400">{formatTransactionDate(tx.timestamp)}</p>
                                            </div>
                                            {/* Show charm token name and amount if available */}
                                            {tx.charmTokenData?.tokenName && (
                                                <p className="text-xs text-purple-400 mb-1 font-medium">
                                                    {tx.charmTokenData.tokenName} • {tx.charmTokenData.tokenAmount.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 8})} {tx.charmTokenData.tokenTicker}
                                                </p>
                                            )}
                                            {/* Full txid on desktop, truncated on mobile */}
                                            <p className="hidden lg:block text-xs text-dark-400 hover:text-primary-400 transition-colors font-mono break-all">
                                                {tx.txid}
                                            </p>
                                            <p className="lg:hidden text-xs text-dark-400 hover:text-primary-400 transition-colors truncate font-mono">
                                                {tx.txid.slice(0, 8)}...{tx.txid.slice(-8)}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    {/* Right section: Amount + Status */}
                                    <div className="flex flex-col sm:text-right space-y-1 flex-shrink-0">
                                        {/* Show charm token amount or BTC amount */}
                                        {isCharmTransaction(tx) && tx.charmTokenData ? (
                                            <p className={`font-medium text-sm sm:text-base ${tx.type === 'charm_received' ? 'text-green-400' : tx.type === 'charm_sent' ? 'text-red-400' : 'text-purple-400'}`}>
                                                {tx.type === 'charm_received' ? '+' : tx.type === 'charm_sent' ? '-' : ''}{tx.charmTokenData.tokenAmount.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 8})} {tx.charmTokenData.tokenTicker}
                                            </p>
                                        ) : isCharmTransaction(tx) ? (
                                            <p className="font-medium text-sm sm:text-base text-dark-400">
                                                Charm Transaction
                                            </p>
                                        ) : (
                                            <p className={`font-medium text-sm sm:text-base ${tx.type === 'received' ? 'text-green-400' : 'text-red-400'}`}>
                                                {tx.type === 'received' ? '+' : '-'}{formatBTC(tx.amount)} BTC
                                            </p>
                                        )}
                                        <div className="flex items-center justify-end gap-x-2 text-xs">
                                            <span className={getStatusColor(tx.status)}>{tx.status}</span>
                                            {tx.blockHeight && (
                                                <span className="text-dark-500">({tx.blockHeight.toLocaleString()})</span>
                                            )}
                                            {/* Only show fee for non-charm transactions */}
                                            {tx.fee && tx.type === 'sent' && !isCharmTransaction(tx) && (
                                                <>
                                                    <span className="text-dark-500 hidden sm:inline">•</span>
                                                    <span className="text-dark-400">Fee: {formatBTC(tx.fee)}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* More Button */}
                    {transactions.length > 8 && (
                        <div className="mt-4 pt-4 border-t border-dark-700 text-center">
                            <button
                                onClick={onViewAllTransactions}
                                className="text-sm text-primary-400 hover:text-primary-300 transition-colors font-medium"
                            >
                                More →
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* Transaction Details Modal */}
            {selectedTransaction && (
                <TransactionDetailsModal
                    transaction={selectedTransaction}
                    network={activeNetwork}
                    onClose={() => setSelectedTransaction(null)}
                />
            )}
        </div>
    );
}
