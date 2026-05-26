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
import SendBitcoinDialog from '../utxos/SendBitcoinDialog';
import ReceiveBitcoinDialog from './components/ReceiveBitcoinDialog';
import BroMintingBanner from './components/BroMintingBanner';
import TransferCharmWizard from '../charms/transfer/TransferCharmWizard';
import BeamDialog from '@/components/beam/BeamDialog';
import EbtcBeamDialog from '@/components/beam/EbtcBeamDialog';
import { useWalletSync } from '@/hooks/useWalletSync';
import { getBroTokenAppId } from '@/services/charms/charms-explorer-api';
import { useNavigation } from '@/contexts/NavigationContext';
import { useBeamOperations } from '@/contexts/BeamOperationsContext';

export default function UserDashboard({ seedPhrase, walletInfo, derivationLoading, createSuccess }) {
    const [showSendDialog, setShowSendDialog] = useState(false);
    const [showReceiveDialog, setShowReceiveDialog] = useState(false);
    const [receiveAsset, setReceiveAsset] = useState('Bitcoin');
    const [showBroTransferDialog, setShowBroTransferDialog] = useState(false);
    const [showBroBeamDialog, setShowBroBeamDialog] = useState(false);
    const [showEbtcBeamDialog, setShowEbtcBeamDialog] = useState(false);
    const [broCharmToTransfer, setBroCharmToTransfer] = useState(null);
    const [btcPrice, setBtcPrice] = useState(null);
    const [priceLoading, setPriceLoading] = useState(true);

    const { hasWallet } = useWallet();
    const { utxos, totalBalance, pendingBalance, isLoading: utxosLoading, loadUTXOs } = useUTXOs();
    const { charms, isLoading: charmsLoading, groupTokensByAppId } = useCharms();
    const { addresses, isLoading: addressesLoading, loadAddresses } = useAddresses();
    const { activeBlockchain, activeNetwork } = useBlockchain();
    const { syncFullWallet, isSyncing: isRefreshing, syncProgress } = useWalletSync();
    const { setActiveSection } = useNavigation();
    useBeamOperations();
    
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
        setReceiveAsset('Bitcoin');
        setShowReceiveDialog(true);
    };

    const handleViewHistory = () => {
        setActiveSection('history');
    };

    const handleSendBro = () => {
        const broAppId = getBroTokenAppId();
        
        // Use groupTokensByAppId to get correct structure with all UTXOs
        const groupedTokens = groupTokensByAppId();
        const broToken = groupedTokens.find(token => token.appId === broAppId);
        
        if (broToken && broToken.tokenUtxos.length > 0) {
            // Construct charm object with correct structure for TransferCharmWizard
            const broCharmForTransfer = {
                ...broToken.tokenUtxos[0],      // First UTXO with all metadata
                totalAmount: broToken.totalAmount,
                allUtxos: broToken.tokenUtxos    // All UTXOs for this token
            };
            setBroCharmToTransfer(broCharmForTransfer);
            setShowBroTransferDialog(true);
        } else {
            console.warn('No BRO tokens available to send');
        }
    };

    const handleBeamBro = () => {
        const broAppId = getBroTokenAppId();
        const groupedTokens = groupTokensByAppId();
        const broToken = groupedTokens.find(token => token.appId === broAppId);

        if (broToken && broToken.tokenUtxos.length > 0) {
            setBroCharmToTransfer({
                ...broToken.tokenUtxos[0],
                totalAmount: broToken.totalAmount,
                allUtxos: broToken.tokenUtxos
            });
            setShowBroBeamDialog(true);
        }
    };

    const handleEbtcBeam = () => {
        setShowEbtcBeamDialog(true);
    };

    const handleReceiveBro = () => {
        // For receiving BRO, just show the receive dialog (same as BTC)
        setReceiveAsset('Bro');
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
            // 1) Balance + UTXOs + charms via unified sync (Cardano-aware).
            await syncFullWallet();

            // 2) BTC tx history — incremental via watermark. Cardano is a no-op.
            //    Doing it here means the dashboard's single Refresh button covers
            //    both balance and history; per-section buttons stay only when
            //    they cover something specific.
            if (activeBlockchain !== 'cardano') {
                const { syncTransactionHistory } = await import('@/services/wallet/sync/transactions-sync');
                await syncTransactionHistory({ blockchain: activeBlockchain, network: activeNetwork, mode: 'incremental' });
            }

            // 3) Refresh address list (non-critical).
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
        <div className="p-2 md:p-4">
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
                            onEbtcBeam={handleEbtcBeam}
                            onSendBro={handleSendBro}
                            onBeamBro={handleBeamBro}
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

            {/* Receive Bitcoin / Token Dialog */}
            <ReceiveBitcoinDialog
                isOpen={showReceiveDialog}
                onClose={() => setShowReceiveDialog(false)}
                assetName={receiveAsset}
            />

            {/* BRO Transfer Dialog */}
            {broCharmToTransfer && showBroTransferDialog && (
                <TransferCharmWizard
                    charm={broCharmToTransfer}
                    show={showBroTransferDialog}
                    onClose={() => {
                        setShowBroTransferDialog(false);
                        setBroCharmToTransfer(null);
                    }}
                />
            )}

            {/* BRO Beam Dialog */}
            {broCharmToTransfer && showBroBeamDialog && (
                <BeamDialog
                    charm={broCharmToTransfer}
                    onClose={() => {
                        setShowBroBeamDialog(false);
                        setBroCharmToTransfer(null);
                    }}
                />
            )}

            {/* eBTC Beam Dialog */}
            {showEbtcBeamDialog && (
                <EbtcBeamDialog onClose={() => setShowEbtcBeamDialog(false)} />
            )}
        </div>
    );
}
