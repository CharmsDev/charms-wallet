'use client';

import { getTransactionLabel, getTransactionIcon } from '@/services/transactions/transaction-classifier';
import { formatBTC, formatTransactionDate } from '@/utils/formatters';

export default function TransactionList({ 
    transactions, 
    selectedTransaction, 
    onSelectTransaction, 
    isLoading,
    currentPage,
    totalPages,
    totalTransactions,
    onNextPage,
    onPreviousPage,
    onGoToPage
}) {

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
            case 'charm_consolidation':
                return 'bg-cyan-500/20 text-cyan-400';
            case 'charm_self_transfer':
                return 'bg-blue-500/20 text-blue-400';
            default:
                return 'bg-dark-500/20 text-dark-400';
        }
    };

    const isCharmTransaction = (tx) => {
        return ['charm_received', 'charm_sent', 'charm_transfer', 'charm_consolidation', 'charm_self_transfer', 'bro_mint', 'bro_mining'].includes(tx.type);
    };

    if (isLoading) {
        return (
            <div className="card p-4">
                <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="p-3 glass-effect rounded-lg animate-pulse">
                            <div className="flex items-center space-x-3">
                                <div className="h-10 w-10 bg-dark-700 rounded-full"></div>
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 bg-dark-700 rounded w-3/4"></div>
                                    <div className="h-3 bg-dark-700 rounded w-1/2"></div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (transactions.length === 0) {
        return (
            <div className="card p-8 text-center">
                <div className="text-4xl mb-4">📭</div>
                <p className="text-dark-400 font-medium">No transactions found</p>
                <p className="text-sm text-dark-500 mt-2">
                    Try adjusting your filters or refresh to check for new transactions
                </p>
            </div>
        );
    }

    return (
        <div className="card flex flex-col" style={{ height: 'calc(100vh - 200px)' }}>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                {transactions.map((tx) => {
                    const isSelected = selectedTransaction?.id === tx.id;
                    
                    return (
                        <button
                            key={tx.id}
                            onClick={() => onSelectTransaction(tx)}
                            className={`w-full p-3 rounded-lg transition-all text-left ${
                                isSelected 
                                    ? 'bg-primary-500/20 border-2 border-primary-500' 
                                    : 'glass-effect hover:bg-dark-800/50 border-2 border-transparent'
                            }`}
                        >
                            <div className="flex items-start space-x-3">
                                {/* Icon */}
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${getIconStyle(tx.type)}`}>
                                    <span className="text-lg">{getTransactionIcon(tx.type)}</span>
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    {/* Type and Token */}
                                    <div className="flex items-center gap-2 mb-1">
                                        <p className="font-medium text-white truncate">
                                            {getTransactionLabel(tx.type)}
                                        </p>
                                        {tx.charmTokenData?.tokenTicker && (
                                            <span className="px-2 py-0.5 text-xs font-semibold bg-purple-500/20 text-purple-400 rounded">
                                                {tx.charmTokenData.tokenTicker}
                                            </span>
                                        )}
                                    </div>

                                    {/* Amount */}
                                    <div className="mb-1">
                                        {isCharmTransaction(tx) && tx.charmTokenData ? (
                                            <p className={`text-sm font-medium ${
                                                tx.type === 'charm_received' ? 'text-green-400' : 
                                                tx.type === 'charm_sent' ? 'text-red-400' : 
                                                'text-purple-400'
                                            }`}>
                                                {tx.type === 'charm_received' ? '+' : tx.type === 'charm_sent' ? '-' : ''}
                                                {tx.charmTokenData.tokenAmount.toLocaleString(undefined, {
                                                    minimumFractionDigits: 0, 
                                                    maximumFractionDigits: 8
                                                })} {tx.charmTokenData.tokenTicker}
                                            </p>
                                        ) : !isCharmTransaction(tx) ? (
                                            <p className={`text-sm font-medium ${
                                                tx.type === 'received' ? 'text-green-400' : 'text-red-400'
                                            }`}>
                                                {tx.type === 'received' ? '+' : '-'}{formatBTC(tx.amount)} BTC
                                            </p>
                                        ) : (
                                            <p className="text-sm text-dark-400">Charm Transaction</p>
                                        )}
                                    </div>

                                    {/* Date and Status */}
                                    <div className="flex items-center gap-2 text-xs">
                                        <span className="text-dark-400">{formatTransactionDate(tx.timestamp)}</span>
                                        <span className="text-dark-500">•</span>
                                        <span className={`${
                                            tx.status === 'confirmed' ? 'text-green-400' :
                                            tx.status === 'pending' ? 'text-yellow-400' :
                                            'text-red-400'
                                        }`}>
                                            {tx.status}
                                        </span>
                                    </div>
                                </div>

                                {/* Selection indicator */}
                                {isSelected && (
                                    <div className="flex-shrink-0">
                                        <svg className="w-5 h-5 text-primary-400" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="border-t border-dark-700 p-4 mt-auto">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="text-sm text-dark-400 text-center sm:text-left">
                            Page {currentPage} of {totalPages}
                            <span className="block sm:inline sm:ml-2">({totalTransactions} total)</span>
                        </div>

                        <div className="flex items-center justify-center sm:justify-end space-x-2">
                            <button
                                onClick={onPreviousPage}
                                disabled={currentPage === 1}
                                className="px-3 py-1 text-sm bg-dark-700 hover:bg-dark-600 disabled:bg-dark-800 disabled:text-dark-500 rounded transition-colors"
                            >
                                Previous
                            </button>

                            {/* Page numbers - responsive */}
                            <div className="hidden sm:flex space-x-1">
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                    let pageNum;
                                    if (totalPages <= 5) {
                                        pageNum = i + 1;
                                    } else {
                                        const start = Math.max(1, currentPage - 2);
                                        const end = Math.min(totalPages, start + 4);
                                        pageNum = start + i;
                                        if (pageNum > end) return null;
                                    }

                                    return (
                                        <button
                                            key={pageNum}
                                            onClick={() => onGoToPage(pageNum)}
                                            className={`px-2 py-1 text-sm rounded transition-colors ${pageNum === currentPage
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
                                {currentPage}/{totalPages}
                            </div>

                            <button
                                onClick={onNextPage}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1 text-sm bg-dark-700 hover:bg-dark-600 disabled:bg-dark-800 disabled:text-dark-500 rounded transition-colors"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
