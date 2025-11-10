'use client';

import { useState, useEffect } from 'react';
import { useTransactions } from '@/stores/transactionStore';
import { useBlockchain } from '@/stores/blockchainStore';
import { useAddresses } from '@/stores/addressesStore';
import { useUTXOStore } from '@/stores/utxoStore';
import { useCharmsStore } from '@/stores/charms';
import TransactionDetailsModal from './TransactionDetailsModal';
import { getTransactionLabel, getTransactionIcon } from '@/services/transactions/transaction-classifier';
import { scanCharmTransactions } from '@/services/wallet/sync/transaction-scanner';

export default function RecentTransactions({ utxos, isLoading }) {
    const {
        transactions,
        isLoading: txLoading,
        loadTransactions,
        processUTXOsForReceivedTransactions,
        recordSentTransaction,
        getPaginatedTransactions,
        pagination,
        nextPage,
        previousPage,
        goToPage
    } = useTransactions();
    const { activeBlockchain, activeNetwork } = useBlockchain();
    const { addresses } = useAddresses();
    const { refreshUTXOs, refreshProgress } = useUTXOStore();
    const { charms } = useCharmsStore();
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Get current page transactions
    const paginatedTransactions = getPaginatedTransactions();

    // Track list rendering attempts
    useEffect(() => {
    }, [transactions, pagination.currentPage, pagination.totalPages, paginatedTransactions.length]);

    // Handle transaction click - show details modal
    const handleTransactionClick = (tx) => {
        setSelectedTransaction(tx);
    };

    // Load transactions from localStorage only on mount or network change
    useEffect(() => {
        loadTransactions(activeBlockchain, activeNetwork);
    }, [activeBlockchain, activeNetwork, loadTransactions]);

    const formatBTC = (satoshis) => {
        const btc = satoshis / 100000000;
        return btc.toFixed(8);
    };

    const formatDate = (timestamp) => {
        return new Date(timestamp).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    /**
     * Optimized transaction refresh
     * - Refreshes UTXOs from first 10 addresses (lightweight)
     * - Scans for new received transactions
     * - Does NOT recalculate balances or parse charms (optimization)
     */
    const handleRefreshTransactions = async () => {
        if (isRefreshing || !addresses || addresses.length === 0) {
            console.log('[RecentTx] Refresh blocked:', { isRefreshing, addressCount: addresses?.length });
            return;
        }

        console.log('[RecentTx] Starting optimized transaction refresh...');
        console.log('[RecentTx] Current transactions count:', transactions.length);
        
        setIsRefreshing(true);
        try {
            // Refresh UTXOs first
            console.log('[RecentTx] Refreshing UTXOs...');
            await refreshUTXOs(activeBlockchain, activeNetwork, 10);
            console.log('[RecentTx] UTXOs refreshed');
            
            // Process UTXOs to detect and record new received transactions
            if (utxos && Object.keys(utxos).length > 0) {
                console.log('[RecentTx] Scanning for new transactions...', Object.keys(utxos).length, 'addresses');
                await processUTXOsForReceivedTransactions(utxos, addresses, activeBlockchain, activeNetwork);
                console.log('[RecentTx] Transaction scan complete');
            } else {
                console.log('[RecentTx] No UTXOs to scan');
            }
            
            // Scan for charm transfer transactions (sent transactions)
            if (charms && charms.length > 0) {
                console.log('[RecentTx] Scanning for charm transfers...', charms.length, 'charms');
                const walletAddresses = new Set(addresses.map(a => a.address));
                await scanCharmTransactions(charms, activeBlockchain, activeNetwork, recordSentTransaction, walletAddresses);
                console.log('[RecentTx] Charm transfer scan complete');
            } else {
                console.log('[RecentTx] No charms to scan');
            }
            
            // Reload transactions from localStorage to display newly detected transactions
            console.log('[RecentTx] Reloading transaction list...');
            loadTransactions(activeBlockchain, activeNetwork);
            console.log('[RecentTx] Transactions reloaded, new count:', transactions.length);
        } catch (error) {
            console.error('[RecentTx] Failed to refresh transactions:', error);
        } finally {
            setIsRefreshing(false);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'confirmed': return 'text-green-400';
            case 'pending': return 'text-yellow-400';
            case 'failed': return 'text-red-400';
            default: return 'text-dark-400';
        }
    };

    const getTypeIcon = (type) => {
        return getTransactionIcon(type);
    };

    const getTransactionDescription = (tx) => {
        return getTransactionLabel(tx.type);
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
            case 'charm_transfer':
                return 'bg-blue-500/20 text-blue-400';
            case 'charm_consolidation':
                return 'bg-cyan-500/20 text-cyan-400';
            default:
                return 'bg-dark-500/20 text-dark-400';
        }
    };

    return (
        <div className="card p-6">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold gradient-text">Recent Transactions</h3>
                <button 
                    onClick={handleRefreshTransactions}
                    disabled={isRefreshing}
                    className="text-sm text-primary-400 hover:text-primary-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    title="Refresh transaction history"
                >
                    <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {isRefreshing ? 'Refreshing...' : 'Refresh'}
                </button>
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
                        {paginatedTransactions.map((tx) => (
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
                                            {getTypeIcon(tx.type)}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <p className="font-medium text-white">{getTransactionDescription(tx)}</p>
                                                {tx.metadata?.ticker && (
                                                    <>
                                                        <span className="text-dark-500">•</span>
                                                        <span className="text-sm font-semibold text-primary-400">{tx.metadata.ticker}</span>
                                                    </>
                                                )}
                                                <span className="text-dark-500">•</span>
                                                <p className="text-sm text-dark-400">{formatDate(tx.timestamp)}</p>
                                            </div>
                                            {tx.metadata?.charmAmount && (
                                                <p className="text-xs text-blue-400 mb-1">
                                                    Amount: {(tx.metadata.charmAmount / 100000000).toLocaleString()} {tx.metadata.ticker || 'tokens'}
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
                                        <p className={`font-medium text-sm sm:text-base ${tx.type === 'received' ? 'text-green-400' : 'text-red-400'}`}>
                                            {tx.type === 'received' ? '+' : '-'}{formatBTC(tx.amount)} BTC
                                        </p>
                                        <div className="flex items-center justify-end gap-x-2 text-xs">
                                            <span className={getStatusColor(tx.status)}>{tx.status}</span>
                                            {tx.blockHeight && (
                                                <span className="text-dark-500">({tx.blockHeight.toLocaleString()})</span>
                                            )}
                                            {tx.fee && tx.type === 'sent' && (
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

                    {/* Pagination Controls */}
                    {pagination.totalPages > 1 && (
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4 pt-4 border-t border-dark-700">
                            <div className="text-sm text-dark-400 text-center sm:text-left">
                                Page {pagination.currentPage} of {pagination.totalPages}
                                <span className="block sm:inline sm:ml-2">({pagination.totalTransactions} total)</span>
                            </div>

                            <div className="flex items-center justify-center sm:justify-end space-x-2">
                                <button
                                    onClick={previousPage}
                                    disabled={pagination.currentPage === 1}
                                    className="px-3 py-1 text-sm bg-dark-700 hover:bg-dark-600 disabled:bg-dark-800 disabled:text-dark-500 rounded transition-colors"
                                >
                                    Previous
                                </button>

                                {/* Page numbers - responsive */}
                                <div className="hidden sm:flex space-x-1">
                                    {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                                        let pageNum;
                                        if (pagination.totalPages <= 5) {
                                            pageNum = i + 1;
                                        } else {
                                            const start = Math.max(1, pagination.currentPage - 2);
                                            const end = Math.min(pagination.totalPages, start + 4);
                                            pageNum = start + i;
                                            if (pageNum > end) return null;
                                        }

                                        return (
                                            <button
                                                key={pageNum}
                                                onClick={() => goToPage(pageNum)}
                                                className={`px-2 py-1 text-sm rounded transition-colors ${pageNum === pagination.currentPage
                                                        ? 'bg-primary-500 text-white'
                                                        : 'bg-dark-700 hover:bg-dark-600 text-dark-300'
                                                    }`}
                                            >
                                                {pageNum}
                                            </button>
                                        );
                                    })}
                                </div>
                                
                                {/* Mobile page indicator */}
                                <div className="sm:hidden px-2 py-1 text-sm bg-dark-700 rounded text-dark-300">
                                    {pagination.currentPage}/{pagination.totalPages}
                                </div>

                                <button
                                    onClick={nextPage}
                                    disabled={pagination.currentPage === pagination.totalPages}
                                    className="px-3 py-1 text-sm bg-dark-700 hover:bg-dark-600 disabled:bg-dark-800 disabled:text-dark-500 rounded transition-colors"
                                >
                                    Next
                                </button>
                            </div>
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
