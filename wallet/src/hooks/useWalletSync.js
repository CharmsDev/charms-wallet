/**
 * useWalletSync Hook
 * React hook for wallet synchronization
 */

import { useState, useCallback, useRef } from 'react';
import { syncWallet, syncAfterTransfer, syncUTXOsOnly } from '@/services/wallet/wallet-sync-service';
import { useUTXOs } from '@/stores/utxoStore';
import { useCharmsStore } from '@/stores/charms';
import { useBlockchain } from '@/stores/blockchainStore';
import { useCardano } from '@/stores/cardanoStore';

export function useWalletSync() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState({ phase: null, current: 0, total: 0 });
    const [syncError, setSyncError] = useState(null);
    const syncingRef = useRef(false);

    const { refreshUTXOs } = useUTXOs();
    const addCharm = useCharmsStore(state => state.addCharm);
    const { activeBlockchain, activeNetwork, isCardano } = useBlockchain();
    const cardanoRefresh = useCardano(state => state.refresh);

    /**
     * Full wallet sync (Dashboard)
     * Limited to 12 addresses for fast refresh
     */
    const syncFullWallet = useCallback(async () => {
        if (syncingRef.current) return;
        syncingRef.current = true;

        setIsSyncing(true);
        setSyncError(null);
        setSyncProgress({ phase: 'utxos', current: 0, total: 0 });

        try {
            // Cardano: use cardanoStore.refresh() instead of Bitcoin sync
            if (isCardano()) {
                setSyncProgress({ phase: 'utxos', current: 0, total: 1 });
                await cardanoRefresh();
                setSyncProgress({ phase: 'utxos', current: 1, total: 1 });
                return { success: true };
            }

            const result = await syncWallet({
                blockchain: activeBlockchain,
                network: activeNetwork,
                fullScan: true,
                skipCharms: false,
                // No limit: scan ALL stored addresses every refresh.
                // Partial scans leave stale UTXOs on un-scanned addresses
                // and that was the bug behind balance creeping up on each
                // refresh. balance/batch caps at 50 addresses per request,
                // which is plenty for any normal wallet size.
                addressLimit: null,
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
            syncingRef.current = false;
            setIsSyncing(false);
            setSyncProgress({ phase: null, current: 0, total: 0 });
        }
    }, [activeBlockchain, activeNetwork, refreshUTXOs, addCharm, isCardano, cardanoRefresh]);

    /**
     * Charms-only refresh (Charms tab)
     * First refreshes UTXOs, then scans charms from updated UTXOs
     * Limited to 12 addresses for fast refresh
     */
    const syncCharmsOnly = useCallback(async () => {
        if (syncingRef.current) return;
        syncingRef.current = true;

        setIsSyncing(true);
        setSyncError(null);

        try {
            if (isCardano()) {
                setSyncProgress({ phase: 'utxos', current: 0, total: 1 });
                await cardanoRefresh();
                setSyncProgress({ phase: 'utxos', current: 1, total: 1 });
                return { success: true };
            }

            const result = await syncWallet({
                blockchain: activeBlockchain,
                network: activeNetwork,
                fullScan: true,
                skipCharms: false,
                // No limit: scan ALL stored addresses every refresh.
                // Partial scans leave stale UTXOs on un-scanned addresses
                // and that was the bug behind balance creeping up on each
                // refresh. balance/batch caps at 50 addresses per request,
                // which is plenty for any normal wallet size.
                addressLimit: null,
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
            syncingRef.current = false;
            setIsSyncing(false);
            setSyncProgress({ phase: null, current: 0, total: 0 });
        }
    }, [activeBlockchain, activeNetwork, refreshUTXOs, addCharm, isCardano, cardanoRefresh]);

    /**
     * UTXO-only refresh (UTXOs tab)
     * Scans all addresses to find all UTXOs
     */
    const syncUTXOs = useCallback(async (addressLimit = null) => {
        if (syncingRef.current) return;
        syncingRef.current = true;

        setIsSyncing(true);
        setSyncError(null);

        try {
            if (isCardano()) {
                await cardanoRefresh();
                return { success: true };
            }

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
            syncingRef.current = false;
            setIsSyncing(false);
        }
    }, [activeBlockchain, activeNetwork, refreshUTXOs, isCardano, cardanoRefresh]);

    /**
     * Post-transfer sync
     */
    const syncAfterCharmTransfer = useCallback(async (transferData) => {
        if (syncingRef.current) return;
        syncingRef.current = true;

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
            syncingRef.current = false;
            setIsSyncing(false);
        }
    }, [activeBlockchain, activeNetwork, addCharm]);

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
