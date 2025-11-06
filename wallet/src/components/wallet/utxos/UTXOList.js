'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUTXOs } from '@/stores/utxoStore';
import { useAddresses } from '@/stores/addressesStore';
import { useBlockchain } from '@/stores/blockchainStore';
import { useWallet } from '@/stores/walletStore';
import { useCharms } from '@/stores/charmsStore';
import { useWalletSync } from '@/hooks/useWalletSync';
import config from '@/config';
import { utxoService } from '@/services/utxo';
import { utxoCalculations } from '@/services/utxo/utils/calculations';
import { getUIPreferences, updateUIPreference } from '@/services/preferences/ui-preferences';
import Switch from '@/components/ui/Switch';
import SendBitcoinDialog from './SendBitcoinDialog';

// Helper function for sorting UTXOs to ensure consistent ordering
const sortUtxos = (a, b) => {
    // Primary sort: by address index
    if (a.addressIndex !== b.addressIndex) {
        return a.addressIndex - b.addressIndex;
    }
    // Secondary sort: external addresses (isChange=false) before change addresses (isChange=true)
    if (a.isChange !== b.isChange) {
        return a.isChange ? 1 : -1;
    }
    // Tertiary sort: by transaction ID for consistency
    return a.txid.localeCompare(b.txid);
};

export default function UTXOList() {
    const {
        utxos,
        isLoading,
        error,
        totalBalance,
        refreshProgress,
        loadUTXOs,
        updateAfterTransaction,
        formatValue,
        initialized,
        cancelUTXORefresh
    } = useUTXOs();
    
    const { syncUTXOs, isSyncing } = useWalletSync();
    
    // Progressive refresh state
    const [refreshOffset, setRefreshOffset] = useState(0);
    const [isProgressiveRefresh, setIsProgressiveRefresh] = useState(false);
    const [totalAddressesToScan, setTotalAddressesToScan] = useState(0);
    const { addresses, loadAddresses } = useAddresses();
    const { activeBlockchain, activeNetwork, isBitcoin, isCardano } = useBlockchain();
    const { seedPhrase } = useWallet();
    const { charms } = useCharms();
    const [isSendDialogOpen, setIsSendDialogOpen] = useState(false);
    const [showOnlySpendable, setShowOnlySpendable] = useState(true);

    // Load UI preferences from centralized storage on mount
    useEffect(() => {
        const preferences = getUIPreferences();
        setShowOnlySpendable(preferences.utxoList.showOnlySpendable);
    }, []);

    // Save UI preference when it changes
    useEffect(() => {
        updateUIPreference('utxoList', { showOnlySpendable });
    }, [showOnlySpendable]);

    // Load addresses when component mounts - CRITICAL for UTXO loading to work
    useEffect(() => {
        if (seedPhrase && activeBlockchain && activeNetwork) {
            loadAddresses(activeBlockchain, activeNetwork);
        }
    }, [seedPhrase, activeBlockchain, activeNetwork, loadAddresses]);

    // Load UTXOs from localStorage when network changes (independent of addresses)
    useEffect(() => {
        loadUTXOs(activeBlockchain, activeNetwork);
    }, [activeBlockchain, activeNetwork, loadUTXOs]);

    // Auto-refresh on mount for regtest (development) or Cardano
    useEffect(() => {
        // Only auto-refresh if we have addresses and UTXOs are already loaded
        if (addresses.length > 0 && initialized && (config.bitcoin.isRegtest() || isCardano())) {
            syncUTXOs(); // Scan all addresses
        }
    }, [addresses, initialized, activeBlockchain, activeNetwork, syncUTXOs, isCardano]);

    // Compute flattened and sorted UTXOs using useMemo for performance
    const flattenedUtxos = useMemo(() => {
        const flattened = [];
        Object.entries(utxos).forEach(([address, addressUtxos]) => {
            const addressEntry = addresses.find(addr => addr.address === address);
            const isChange = addressEntry?.isChange || false;
            const isStaking = addressEntry?.isStaking || false;
            const addressIndex = addressEntry?.index ?? 999999; // Put unknown addresses at the end

            addressUtxos.forEach(utxo => {
                // Apply spendability filter if switch is enabled
                if (showOnlySpendable) {
                    const transactionData = null; // Transaction data not loaded in list view
                    if (!utxoCalculations.isUtxoSpendable(utxo, charms, null, transactionData)) {
                        return; // Skip non-spendable UTXOs
                    }
                }
                
                flattened.push({
                    ...utxo,
                    address,
                    isChange,
                    isStaking,
                    addressIndex,
                    formattedValue: formatValue(utxo.value)
                });
            });
        });

        return flattened.sort(sortUtxos);
    }, [utxos, addresses, formatValue, showOnlySpendable, charms]);

    // Derive confirmed UTXOs from the flattened list
    const confirmedUtxos = useMemo(() => {
        return flattenedUtxos.filter(utxo => {
            if (!utxo.status) return true;
            return utxo.status.confirmed;
        });
    }, [flattenedUtxos]);

    const handleCancel = () => {
        // Reset progressive refresh state when canceling
        setIsProgressiveRefresh(false);
        setRefreshOffset(0);
        setTotalAddressesToScan(0);
        // Call the store's cancel function
        cancelUTXORefresh();
    };

    const handleRefresh = async () => {
        // Use unified sync service (UTXO-only, no charms) - scans all addresses
        await syncUTXOs();
    };

    const handleOpenSendDialog = () => {
        setIsSendDialogOpen(true);
    };

    const handleSendBitcoin = async (sendData) => {
        try {
            if (sendData.utxos && sendData.utxos.length > 0) {
                await utxoService.processTransactionCompletion(
                    sendData,
                    updateAfterTransaction,
                    activeBlockchain,
                    activeNetwork
                );
            }
        } catch (error) {
            // Refresh UTXOs on error
            await syncUTXOs();
        }
    };

    if (error) {
        return (
            <div>
                <div className="p-4 sm:p-6 flex justify-between items-center">
                    <h2 className="text-xl font-bold gradient-text hidden md:block">Your UTXOs</h2>
                    <div className="flex items-center flex-wrap gap-2 sm:gap-3">
                        <button
                            className="btn btn-primary"
                            onClick={handleRefresh}
                            disabled={refreshProgress.isRefreshing}
                        >
                            {refreshProgress.isRefreshing 
                                ? `Scanning... ${isProgressiveRefresh 
                                    ? `${refreshOffset + refreshProgress.processed}/${totalAddressesToScan}`
                                    : `${refreshProgress.processed}/${refreshProgress.total}`
                                }` 
                                : isProgressiveRefresh 
                                    ? `Continue (${refreshOffset}/${totalAddressesToScan})` 
                                    : 'Refresh'
                            }
                        </button>
                        {(refreshProgress.isRefreshing || isProgressiveRefresh) && (
                            <button
                                className="btn bg-red-600 hover:bg-red-700 text-white"
                                onClick={handleCancel}
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                </div>
                <div className="error-message">
                    <p>Error: {error}</p>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="p-4 sm:p-6 flex justify-between items-center">
                <h2 className="text-xl font-bold gradient-text hidden md:block">Your UTXOs</h2>
                <div className="flex items-center flex-wrap gap-3 sm:gap-4">
                    <div className="mr-[30px]">
                        <Switch
                            checked={showOnlySpendable}
                            onChange={(e) => setShowOnlySpendable(e.target.checked)}
                            label="Show only spendable"
                        />
                    </div>
                    {isBitcoin() && (
                        <button
                            className={`btn ${confirmedUtxos.length === 0 ? 'opacity-50 cursor-not-allowed bg-dark-700' : 'btn-bitcoin'}`}
                            onClick={handleOpenSendDialog}
                            disabled={confirmedUtxos.length === 0}
                        >
                            Send Bitcoin
                        </button>
                    )}
                    {/* Cardano send button kept commented for now
                    {isCardano() && (
                        <button
                            className={`btn ${confirmedUtxos.length === 0 ? 'opacity-50 cursor-not-allowed bg-dark-700' : 'btn-cardano'}`}
                            onClick={handleOpenSendDialog}
                            disabled={confirmedUtxos.length === 0}
                        >
                            Send ADA
                        </button>
                    )}
                    */}
                    <button
                        className="btn btn-primary"
                        onClick={handleRefresh}
                        disabled={refreshProgress.isRefreshing}
                    >
                        {refreshProgress.isRefreshing ? (
                            <div className="flex items-center space-x-2">
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                <span>
                                    {isProgressiveRefresh 
                                        ? `${refreshOffset + refreshProgress.processed}/${totalAddressesToScan}`
                                        : `${refreshProgress.processed}/${refreshProgress.total}`
                                    }
                                </span>
                            </div>
                        ) : isProgressiveRefresh ? (
                            `Continue (${refreshOffset}/${totalAddressesToScan})`
                        ) : (
                            'Refresh'
                        )}
                    </button>
                    {(refreshProgress.isRefreshing || isProgressiveRefresh) && (
                        <button
                            className="btn bg-red-600 hover:bg-red-700 text-white ml-2"
                            onClick={handleCancel}
                        >
                            Cancel
                        </button>
                    )}
                </div>
            </div>

            <div className="card">
                {isLoading ? (
                    <div className="p-8 text-center">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-400 mb-4"></div>
                        <p className="text-gray-400">Loading UTXOs...</p>
                    </div>
                ) : flattenedUtxos.length === 0 ? (
                    <div className="text-center p-8">
                        <p className="text-dark-300">No UTXOs found. Receive some bitcoin to get started.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead className="bg-dark-700">
                                <tr>
                                    <th className="py-2 px-4 border-b border-dark-600 text-left text-dark-300">UTXO</th>
                                    <th className="py-2 px-4 border-b border-dark-600 text-left text-dark-300">Address</th>
                                    <th className="py-2 px-4 border-b border-dark-600 text-left text-dark-300">Amount & Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {flattenedUtxos.map((utxo, index) => (
                                    <tr key={`${utxo.txid}-${utxo.vout}-${utxo.address}`} className={index % 2 === 0 ? 'bg-dark-800' : 'bg-dark-750'}>
                                        <td className="py-2 px-4 border-b border-dark-700">
                                            <div className="font-mono text-xs break-all text-dark-200" title={`${utxo.txid}:${utxo.vout}`}>
                                                {utxo.txid}:{utxo.vout}
                                            </div>
                                        </td>
                                        <td className="py-2 px-4 border-b border-dark-700">
                                            <div className="flex flex-col">
                                                <div className="font-mono text-xs break-all text-dark-200" title={utxo.address}>
                                                    {utxo.address}
                                                </div>
                                                {addresses.find(addr => addr.address === utxo.address)?.index !== undefined && (
                                                    <span className="text-xs text-dark-400 mt-1">
                                                        Index: {addresses.find(addr => addr.address === utxo.address)?.index}
                                                        {isBitcoin() && utxo.isChange && (
                                                            <span className="text-primary-400 ml-2">Change Address</span>
                                                        )}
                                                        {isCardano() && utxo.isStaking && (
                                                            <span className="text-cardano-400 ml-2">Staking Address</span>
                                                        )}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-2 px-4 border-b border-dark-700">
                                            <div className="flex flex-col">
                                                <div className={isBitcoin() ? "text-bitcoin-400" : "text-cardano-400"}>
                                                    {utxo.formattedValue}
                                                </div>
                                                <div className="mt-1 flex gap-2">
                                                    {(utxo.status?.confirmed !== false) ? (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-900/30 text-green-400">
                                                            Confirmed
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-900/30 text-yellow-400">
                                                            Pending
                                                        </span>
                                                    )}
                                                    {!utxoCalculations.isUtxoSpendable(utxo, charms, null, null) && (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-900/30 text-red-400">
                                                            Reserved
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Send Bitcoin Dialog - only shown for Bitcoin */}
            {isBitcoin() && (
                <SendBitcoinDialog
                    isOpen={isSendDialogOpen}
                    onClose={() => setIsSendDialogOpen(false)}
                    confirmedUtxos={confirmedUtxos}
                    onSend={handleSendBitcoin}
                    formatValue={formatValue}
                />
            )}
        </div>
    );
}
