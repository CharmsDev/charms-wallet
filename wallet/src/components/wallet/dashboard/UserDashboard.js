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
import TransferCharmWizard from '../charms/transfer/TransferCharmWizard';
import { useWalletSync } from '@/hooks/useWalletSync';
import { getBroTokenAppId } from '@/services/charms/charms-explorer-api';
import { useNavigation } from '@/contexts/NavigationContext';

export default function UserDashboard({ seedPhrase, walletInfo, derivationLoading, createSuccess }) {
    const [showSendDialog, setShowSendDialog] = useState(false);
    const [showReceiveDialog, setShowReceiveDialog] = useState(false);
    const [showSettingsDialog, setShowSettingsDialog] = useState(false);
    const [showBroTransferDialog, setShowBroTransferDialog] = useState(false);
    const [broCharmToTransfer, setBroCharmToTransfer] = useState(null);
    const [btcPrice, setBtcPrice] = useState(null);
    const [priceLoading, setPriceLoading] = useState(true);

    const { hasWallet } = useWallet();
    const { utxos, totalBalance, pendingBalance, isLoading: utxosLoading, loadUTXOs } = useUTXOs();
    const { charms, isLoading: charmsLoading } = useCharms();
    const { addresses, isLoading: addressesLoading, loadAddresses } = useAddresses();
    const { activeBlockchain, activeNetwork } = useBlockchain();
    const { syncFullWallet, isSyncing: isRefreshing, syncProgress } = useWalletSync();
    const { setActiveSection } = useNavigation();
    
    // Convert syncProgress to refreshProgress format for BalanceDisplay
    const refreshProgress = {
        processed: syncProgress.current,
        total: syncProgress.total,
        isRefreshing: isRefreshing && syncProgress.phase === 'utxos'
    };

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
        setActiveSection('history');
    };

    const handleSettings = () => {
        setShowSettingsDialog(true);
    };

    const handleSendBro = () => {
        // Find BRO charm from charms list
        const broAppId = getBroTokenAppId();
        const broCharm = charms.find(charm => charm.appId === broAppId);
        
        if (broCharm) {
            setBroCharmToTransfer(broCharm);
            setShowBroTransferDialog(true);
        } else {
            console.warn('No BRO tokens found');
        }
    };

    const handleReceiveBro = () => {
        // For receiving BRO, just show the receive dialog (same as BTC)
        setShowReceiveDialog(true);
    };

    /**
     * UNIFIED DASHBOARD REFRESH
     * 
     * Uses the new wallet sync service to ensure data consistency:
     * 
     * 1. UTXOs FIRST (24 addresses = 12 indices × 2 types)
     *    - Scans first 12 receive addresses (m/86'/0'/0'/0/0 to m/86'/0'/0'/0/11)
     *    - Scans first 12 change addresses (m/86'/0'/0'/1/0 to m/86'/0'/0'/1/11)
     *    - Updates balance in real-time during scan
     *    - Deduplicates UTXOs by txid:vout
     * 
     * 2. CHARMS SECOND (based on updated UTXOs)
     *    - Processes ALL UTXOs detected in step 1 for charm detection
     *    - Filters out spent charms automatically
     *    - Recalculates BRO token balance with latest data
     *    - Updates charm cache for faster subsequent loads
     * 
     * 3. ADDRESSES LAST
     *    - Refreshes address list for current network
     *    - Ensures UI has latest address data
     * 
     * BENEFITS:
     * - Single source of truth (wallet-sync-service)
     * - Guarantees charms use the most recent UTXO data
     * - Prevents race conditions between UTXO and charm updates
     * - Ensures BRO balance reflects all detected tokens
     * - Provides detailed progress feedback to user
     */
    const handleRefresh = async () => {
        if (isRefreshing) return;
        
        try {
            // Use unified sync service - scans all addresses
            await syncFullWallet();
            
            // Refresh addresses (non-critical)
            await loadAddresses(activeBlockchain, activeNetwork);
        } catch (error) {
            console.error("Failed to refresh wallet data:", error);
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
                    {/* Left Column - Balance and Transactions */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Balance Display */}
                        <BalanceDisplay
                            balance={totalBalance}
                            pendingBalance={pendingBalance}
                            btcPrice={btcPrice}
                            priceLoading={priceLoading}
                            isLoading={utxosLoading}
                            network={activeNetwork}
                            onRefresh={handleRefresh}
                            isRefreshing={isRefreshing}
                            refreshProgress={refreshProgress}
                            onSendBTC={() => setShowSendDialog(true)}
                            onReceiveBTC={() => setShowReceiveDialog(true)}
                            onSendBro={handleSendBro}
                            onReceiveBro={handleReceiveBro}
                        />

                        {/* Recent Transactions */}
                        <RecentTransactions
                            utxos={utxos}
                            isLoading={utxosLoading}
                            onViewAllTransactions={handleViewHistory}
                        />
                    </div>

                    {/* Right Column - Portfolio and Security */}
                    <div className="space-y-6">
                        {/* Bro Minting Banner */}
                        <BroMintingBanner />

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

            {/* BRO Transfer Dialog */}
            {broCharmToTransfer && (
                <TransferCharmWizard
                    charm={broCharmToTransfer}
                    show={showBroTransferDialog}
                    onClose={() => {
                        setShowBroTransferDialog(false);
                        setBroCharmToTransfer(null);
                    }}
                />
            )}
        </div>
    );
}
