/**
 * useWalletSync Hook
 * React hook for wallet synchronization
 */

import { useState, useCallback } from 'react';
import { syncWallet, syncAfterTransfer, syncUTXOsOnly } from '@/services/wallet/wallet-sync-service';
import { useUTXOs } from '@/stores/utxoStore';
import { useCharmsStore } from '@/stores/charms';
import { useBlockchain } from '@/stores/blockchainStore';

export function useWalletSync() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState({ phase: null, current: 0, total: 0 });
    const [syncError, setSyncError] = useState(null);

    const { refreshUTXOs } = useUTXOs();
    const addCharm = useCharmsStore(state => state.addCharm);
    const { activeBlockchain, activeNetwork } = useBlockchain();

    /**
     * Full wallet sync (Dashboard)
     * Limited to 12 addresses for fast refresh
     */
    const syncFullWallet = useCallback(async () => {
        if (isSyncing) return;

        setIsSyncing(true);
        setSyncError(null);
        setSyncProgress({ phase: 'utxos', current: 0, total: 0 });

        try {
            const result = await syncWallet({
                blockchain: activeBlockchain,
                network: activeNetwork,
                fullScan: true,
                skipCharms: false,
                addressLimit: 12,  // Limit to 12 addresses for fast refresh
                onUTXOProgress: (progress) => {
                    setSyncProgress({
                        phase: 'utxos',
                        current: progress.processed || 0,
                        total: progress.total || 0
                    });
                },
                onCharmProgress: (current, total) => {
                    setSyncProgress({ phase: 'charms', current, total });
                },
                onCharmFound: addCharm,
                updateUTXOStore: refreshUTXOs
            });

            if (!result.success) {
                throw new Error(result.error || 'Sync failed');
            }

            return result;
        } catch (error) {
            setSyncError(error.message);
            throw error;
        } finally {
            setIsSyncing(false);
            setSyncProgress({ phase: null, current: 0, total: 0 });
        }
    }, [isSyncing, activeBlockchain, activeNetwork, refreshUTXOs, addCharm]);

    /**
     * Charms-only refresh (Charms tab)
     * First refreshes UTXOs, then scans charms from updated UTXOs
     * Limited to 12 addresses for fast refresh
     */
    const syncCharmsOnly = useCallback(async () => {
        if (isSyncing) return;

        setIsSyncing(true);
        setSyncError(null);

        try {
            const result = await syncWallet({
                blockchain: activeBlockchain,
                network: activeNetwork,
                fullScan: true,  // Refresh UTXOs first
                skipCharms: false,
                addressLimit: 12,  // Limit to 12 addresses for fast refresh
                onUTXOProgress: (progress) => {
                    setSyncProgress({
                        phase: 'utxos',
                        current: progress.processed || 0,
                        total: progress.total || 0
                    });
                },
                onCharmProgress: (current, total) => {
                    setSyncProgress({ phase: 'charms', current, total });
                },
                onCharmFound: addCharm,
                updateUTXOStore: refreshUTXOs
            });

            if (!result.success) {
                throw new Error(result.error || 'Sync failed');
            }

            return result;
        } catch (error) {
            setSyncError(error.message);
            throw error;
        } finally {
            setIsSyncing(false);
            setSyncProgress({ phase: null, current: 0, total: 0 });
        }
    }, [isSyncing, activeBlockchain, activeNetwork, refreshUTXOs, addCharm]);

    /**
     * UTXO-only refresh (UTXOs tab)
     * Scans all addresses to find all UTXOs
     */
    const syncUTXOs = useCallback(async (addressLimit = null) => {
        if (isSyncing) return;

        setIsSyncing(true);
        setSyncError(null);

        try {
            const result = await syncUTXOsOnly(
                activeBlockchain,
                activeNetwork,
                refreshUTXOs,
                addressLimit
            );

            if (!result.success) {
                throw new Error(result.error || 'Sync failed');
            }

            return result;
        } catch (error) {
            setSyncError(error.message);
            throw error;
        } finally {
            setIsSyncing(false);
        }
    }, [isSyncing, activeBlockchain, activeNetwork, refreshUTXOs]);

    /**
     * Post-transfer sync
     */
    const syncAfterCharmTransfer = useCallback(async (transferData) => {
        if (isSyncing) return;

        setIsSyncing(true);
        setSyncError(null);

        try {
            const result = await syncAfterTransfer(
                transferData,
                activeBlockchain,
                activeNetwork,
                addCharm
            );

            if (!result.success) {
                throw new Error(result.error || 'Post-transfer sync failed');
            }

            return result;
        } catch (error) {
            setSyncError(error.message);
            throw error;
        } finally {
            setIsSyncing(false);
        }
    }, [isSyncing, activeBlockchain, activeNetwork, addCharm]);

    return {
        isSyncing,
        syncProgress,
        syncError,
        syncFullWallet,
        syncCharmsOnly,
        syncUTXOs,
        syncAfterCharmTransfer
    };
}
