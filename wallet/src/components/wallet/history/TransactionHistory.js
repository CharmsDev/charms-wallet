'use client';

import { useState, useEffect } from 'react';
import { useTransactions } from '@/stores/transactionStore';
import { useBlockchain } from '@/stores/blockchainStore';
import { useAddresses } from '@/stores/addressesStore';
import TransactionList from './components/TransactionList';
import TransactionDetail from './components/TransactionDetail';

export default function TransactionHistory() {
    const {
        transactions,
        isLoading,
        loadTransactions,
        reprocessCharmTransactions
    } = useTransactions();

    const { activeBlockchain, activeNetwork } = useBlockchain();
    const { addresses } = useAddresses();
    
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    // Initialize transactions from storage on mount and network changes
    useEffect(() => {
        loadTransactions(activeBlockchain, activeNetwork);
    }, [activeBlockchain, activeNetwork, loadTransactions]);

    // Auto-select first transaction for immediate detail view
    useEffect(() => {
        if (transactions.length > 0 && !selectedTransaction) {
            setSelectedTransaction(transactions[0]);
        }
    }, [transactions, selectedTransaction]);

    const handleTransactionSelect = (tx) => {
        setSelectedTransaction(tx);
    };

    // Calculate pagination boundaries
    const totalPages = Math.ceil(transactions.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedTransactions = transactions.slice(startIndex, endIndex);

    // Reset pagination when transaction list changes
    useEffect(() => {
        setCurrentPage(1);
    }, [transactions.length]);

    const goToPage = (page) => {
        setCurrentPage(page);
        setSelectedTransaction(null);
    };

    const nextPage = () => {
        if (currentPage < totalPages) {
            setCurrentPage(prev => prev + 1);
            setSelectedTransaction(null);
        }
    };

    const previousPage = () => {
        if (currentPage > 1) {
            setCurrentPage(prev => prev - 1);
            setSelectedTransaction(null);
        }
    };

    /**
     * Refreshes transaction history by syncing UTXOs and charm data
     * Performs a comprehensive scan to detect new transactions and update existing ones
     */
    const handleRefresh = async () => {
        if (isRefreshing || !addresses || addresses.length === 0) {
            return;
        }

        setIsRefreshing(true);
        try {
            if (activeBlockchain === 'cardano') { setIsRefreshing(false); return; }
            // 1) Balance + UTXOs + charms (single balance/batch round trip)
            const { syncWalletExplorer } = await import('@/services/wallet/sync/explorer-wallet-sync');
            await syncWalletExplorer({ blockchain: activeBlockchain, network: activeNetwork, fullScan: true, skipCharms: false });

            // 2) Tx history via transactions/batch — incremental via watermark.
            //    Inline charm.detected + assets[] eliminates per-tx fetches.
            const { syncTransactionHistory } = await import('@/services/wallet/sync/transactions-sync');
            await syncTransactionHistory({ blockchain: activeBlockchain, network: activeNetwork, mode: 'incremental' });

            // 3) Reclassify with full vin/vout for charm txs lacking it
            //    (gated by tx.charmChecked so we never re-query a known answer).
            await reprocessCharmTransactions(activeBlockchain, activeNetwork, addresses);
            await loadTransactions(activeBlockchain, activeNetwork);
        } catch (error) {
            // Silently handle refresh errors to avoid disrupting user experience
        } finally {
            setIsRefreshing(false);
        }
    };

    return (
        <div>
            <div className="p-6 flex items-center justify-between">
                <h2 className="text-xl font-bold gradient-text">Transaction History</h2>
                <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="btn btn-primary flex items-center gap-2"
                >
                    {isRefreshing && (
                        <span className="inline-block animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white" />
                    )}
                    {isRefreshing ? 'Refreshing…' : 'Refresh'}
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 xl:col-span-4">
                    <TransactionList
                        transactions={paginatedTransactions}
                        selectedTransaction={selectedTransaction}
                        onSelectTransaction={handleTransactionSelect}
                        isLoading={isLoading}
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalTransactions={transactions.length}
                        onNextPage={nextPage}
                        onPreviousPage={previousPage}
                        onGoToPage={goToPage}
                    />
                </div>

                <div className="lg:col-span-7 xl:col-span-8">
                    <TransactionDetail
                        transaction={selectedTransaction}
                        network={activeNetwork}
                    />
                </div>
            </div>
        </div>
    );
}
