'use client';

import { useState, useEffect } from 'react';
import { useTransactions } from '@/stores/transactionStore';
import { useBlockchain } from '@/stores/blockchainStore';
import { useAddresses } from '@/stores/addressesStore';

export default function RecentTransactions({ utxos, isLoading }) {
    const { 
        transactions, 
        isLoading: txLoading, 
        loadTransactions, 
        processUTXOsForTransactions,
        getPaginatedTransactions,
        pagination,
        nextPage,
        previousPage,
        goToPage
    } = useTransactions();
    const { activeBlockchain, activeNetwork } = useBlockchain();
    const { addresses } = useAddresses();

    // Get current page transactions
    const paginatedTransactions = getPaginatedTransactions();

    // Handle transaction click - open mempool.space
    const handleTransactionClick = (txId) => {
        const baseUrl = activeNetwork === 'mainnet' 
            ? 'https://mempool.space' 
            : 'https://mempool.space/testnet4';
        
        const url = `${baseUrl}/tx/${txId}`;
        console.log(`[TRANSACTION CLICK] Opening ${url} for network: ${activeNetwork}`);
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    // Load transactions when component mounts or network changes
    useEffect(() => {
        loadTransactions(activeBlockchain, activeNetwork);
    }, [activeBlockchain, activeNetwork, loadTransactions]);

    // Process UTXOs to create transaction entries when UTXOs change
    useEffect(() => {
        if (utxos && Object.keys(utxos).length > 0 && addresses && addresses.length > 0) {
            processUTXOsForTransactions(utxos, addresses, activeBlockchain, activeNetwork);
        }
    }, [utxos, addresses, activeBlockchain, activeNetwork, processUTXOsForTransactions]);

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

    const getStatusColor = (status) => {
        switch (status) {
            case 'confirmed': return 'text-green-400';
            case 'pending': return 'text-yellow-400';
            case 'failed': return 'text-red-400';
            default: return 'text-dark-400';
        }
    };

    const getTypeIcon = (type) => {
        switch (type) {
            case 'sent': return '↗';
            case 'received': return '↙';
            default: return '•';
        }
    };

    return (
        <div className="card p-6">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold gradient-text">Recent Transactions</h3>
                <button className="text-sm text-primary-400 hover:text-primary-300 transition-colors">
                    View All
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
                    <p className="text-sm mt-1">Your transactions will appear here</p>
                </div>
            ) : (
                <>
                    <div className="space-y-2">
                        {paginatedTransactions.map((tx) => (
                        <div 
                            key={tx.id} 
                            onClick={() => handleTransactionClick(tx.txid)}
                            className="flex items-center justify-between p-3 glass-effect rounded-lg hover:bg-dark-800/50 transition-colors cursor-pointer"
                            title={`Click to view transaction ${tx.txid} on mempool.space`}
                        >
                            <div className="flex items-center space-x-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                    tx.type === 'received' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                }`}>
                                    {getTypeIcon(tx.type)}
                                </div>
                                <div>
                                    <p className="font-medium text-white capitalize">{tx.type}</p>
                                    <p className="text-xs text-dark-400 hover:text-primary-400 transition-colors">
                                        {tx.txid.slice(0, 8)}...{tx.txid.slice(-8)}
                                    </p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className={`font-medium ${tx.type === 'received' ? 'text-green-400' : 'text-red-400'}`}>
                                    {tx.type === 'received' ? '+' : '-'}{formatBTC(tx.amount)} BTC
                                </p>
                                <div className="flex items-center space-x-2 text-xs">
                                    <span className={getStatusColor(tx.status)}>{tx.status}</span>
                                    <span className="text-dark-500">•</span>
                                    <span className="text-dark-400">{formatDate(tx.timestamp)}</span>
                                </div>
                            </div>
                        </div>
                        ))}
                    </div>

                    {/* Pagination Controls */}
                    {pagination.totalPages > 1 && (
                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-dark-700">
                            <div className="text-sm text-dark-400">
                                Page {pagination.currentPage} of {pagination.totalPages}
                                <span className="ml-2">({pagination.totalTransactions} total)</span>
                            </div>
                            
                            <div className="flex items-center space-x-2">
                                <button
                                    onClick={previousPage}
                                    disabled={pagination.currentPage === 1}
                                    className="px-3 py-1 text-sm bg-dark-700 hover:bg-dark-600 disabled:bg-dark-800 disabled:text-dark-500 rounded transition-colors"
                                >
                                    Previous
                                </button>
                                
                                {/* Page numbers */}
                                <div className="flex space-x-1">
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
                                                className={`px-2 py-1 text-sm rounded transition-colors ${
                                                    pageNum === pagination.currentPage
                                                        ? 'bg-primary-500 text-white'
                                                        : 'bg-dark-700 hover:bg-dark-600 text-dark-300'
                                                }`}
                                            >
                                                {pageNum}
                                            </button>
                                        );
                                    })}
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
        </div>
    );
}
