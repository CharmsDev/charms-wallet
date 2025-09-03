'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@/stores/walletStore';
import { useUTXOs } from '@/stores/utxoStore';
import { useCharms } from '@/stores/charmsStore';
import { useAddresses } from '@/stores/addressesStore';
import { useBlockchain } from '@/stores/blockchainStore';
import coinGeckoService from '@/services/shared/coingecko-service';
import BalanceDisplay from './components/BalanceDisplay';
import QuickActionsPanel from './components/QuickActionsPanel';
import PortfolioSummary from './components/PortfolioSummary';
import RecentTransactions from './components/RecentTransactions';
import SecurityStatus from './components/SecurityStatus';
import WalletSeed from './components/WalletSeed';
import SendBitcoinDialog from '../utxos/SendBitcoinDialog';
import ReceiveBitcoinDialog from './components/ReceiveBitcoinDialog';
import SettingsDialog from './components/SettingsDialog';
import BroMintingBanner from './components/BroMintingBanner';

export default function UserDashboard({ seedPhrase, walletInfo, derivationLoading, createSuccess }) {
    const [showSendDialog, setShowSendDialog] = useState(false);
    const [showReceiveDialog, setShowReceiveDialog] = useState(false);
    const [showSettingsDialog, setShowSettingsDialog] = useState(false);
    const [btcPrice, setBtcPrice] = useState(null);
    const [priceLoading, setPriceLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const { hasWallet } = useWallet();
    const { utxos, totalBalance, isLoading: utxosLoading, loadUTXOs } = useUTXOs();
    const { charms, isLoading: charmsLoading, loadCharms } = useCharms();
    const { addresses, isLoading: addressesLoading, loadAddresses } = useAddresses();
    const { activeBlockchain, activeNetwork } = useBlockchain();

    // Load data on component mount and network changes
    useEffect(() => {
        if (hasWallet && seedPhrase && !derivationLoading) {
            loadUTXOs(activeBlockchain, activeNetwork);
            // Don't auto-load charms on dashboard - only load when user visits charms tab
            loadAddresses(activeBlockchain, activeNetwork);
        }
    }, [hasWallet, seedPhrase, derivationLoading, activeBlockchain, activeNetwork]);

    // Fetch BTC price using CoinGecko service
    useEffect(() => {
        const fetchBTCPrice = async () => {
            try {
                setPriceLoading(true);
                const priceData = await coinGeckoService.getBitcoinPriceWithState();

                if (priceData.success) {
                    setBtcPrice(priceData.data);
                } else {
                    setBtcPrice(priceData.data);
                }
            } catch (error) {
                setBtcPrice(coinGeckoService.getFallbackPrice());
            } finally {
                setPriceLoading(false);
            }
        };

        fetchBTCPrice();

        // Update every 2 minutes (respecting rate limits)
        const interval = setInterval(fetchBTCPrice, 120000);
        return () => clearInterval(interval);
    }, []);

    const handleSendBitcoin = () => {
        setShowSendDialog(true);
    };

    const handleReceiveBitcoin = () => {
        setShowReceiveDialog(true);
    };

    const handleViewHistory = () => {
        // TODO: Navigate to transaction history
    };

    const handleSettings = () => {
        setShowSettingsDialog(true);
    };

    const handleRefresh = async () => {
        if (isRefreshing) return;

        setIsRefreshing(true);
        try {
            await Promise.all([
                loadUTXOs(activeBlockchain, activeNetwork),
                loadAddresses(activeBlockchain, activeNetwork),
                loadCharms(activeBlockchain, activeNetwork)
            ]);
        } catch (error) {
            console.error("Failed to refresh wallet data:", error);
        } finally {
            setIsRefreshing(false);
        }
    };

    // Format value function for SendBitcoinDialog
    const formatValue = (satoshis) => {
        const btc = satoshis / 100000000;
        return btc.toFixed(8);
    };

    if (derivationLoading) {
        return (
            <div className="min-h-screen bg-dark-950 flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
                    <p className="text-lg text-dark-200">Loading your wallet...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-dark-950 p-4 md:p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold gradient-text">Dashboard</h1>
                        <p className="text-dark-400 mt-1">
                            Welcome to your Bitcoin wallet
                        </p>
                    </div>
                    <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2 text-sm text-dark-400">
                            <div className={`w-2 h-2 rounded-full ${activeNetwork === 'mainnet' ? 'bg-green-500' : 'bg-orange-500'}`}></div>
                            <span className="capitalize">{activeNetwork}</span>
                        </div>
                    </div>
                </div>

                {/* Success notification */}
                {createSuccess && (
                    <div className="glass-effect border-l-4 border-green-500 p-4 rounded-lg">
                        <p className="text-green-400">
                            🎉 Wallet setup successful! Your dashboard is ready.
                        </p>
                    </div>
                )}

                {/* Main Dashboard Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column - Balance and Quick Actions */}
                    <div className="lg:col-span-2 space-y-6">
                        <BroMintingBanner />

                        {/* Balance Display */}
                        <BalanceDisplay
                            balance={totalBalance}
                            btcPrice={btcPrice}
                            priceLoading={priceLoading}
                            isLoading={utxosLoading}
                            network={activeNetwork}
                            onRefresh={handleRefresh}
                            isRefreshing={isRefreshing}
                        />

                        {/* Quick Actions */}
                        <QuickActionsPanel
                            onSend={() => setShowSendDialog(true)}
                            onReceive={() => setShowReceiveDialog(true)}
                            onViewHistory={handleViewHistory}
                            onSettings={() => setShowSettingsDialog(true)}
                        />

                        {/* Recent Transactions */}
                        <RecentTransactions
                            utxos={utxos}
                            isLoading={utxosLoading}
                        />
                    </div>

                    {/* Right Column - Portfolio and Security */}
                    <div className="space-y-6">
                        {/* Portfolio Summary */}
                        <PortfolioSummary
                            utxos={utxos}
                            charms={charms}
                            addresses={addresses}
                            isLoading={utxosLoading || charmsLoading || addressesLoading}
                        />

                        {/* Wallet Seed */}
                        <WalletSeed
                            hasWallet={hasWallet}
                            seedPhrase={seedPhrase}
                            walletInfo={walletInfo}
                        />

                        {/* Security Status */}
                        <SecurityStatus
                            hasWallet={hasWallet}
                            seedPhrase={seedPhrase}
                        />
                    </div>
                </div>
            </div>

            {/* Send Bitcoin Dialog */}
            <SendBitcoinDialog
                isOpen={showSendDialog}
                onClose={() => setShowSendDialog(false)}
                confirmedUtxos={utxos}
                onSend={loadUTXOs}
                formatValue={(value) => `${value} sats`}
            />

            {/* Receive Bitcoin Dialog */}
            <ReceiveBitcoinDialog
                isOpen={showReceiveDialog}
                onClose={() => setShowReceiveDialog(false)}
            />

            {/* Settings Dialog */}
            <SettingsDialog
                isOpen={showSettingsDialog}
                onClose={() => setShowSettingsDialog(false)}
            />
        </div>
    );
}
