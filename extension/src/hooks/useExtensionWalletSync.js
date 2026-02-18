/**
 * useExtensionWalletSync Hook (Extension-only)
 * 
 * Drop-in replacement for useWalletSync that uses the external
 * prover verify API for charm extraction instead of WASM.
 * 
 * This hook has the same interface as the core useWalletSync
 * so it can be swapped in ExtensionDashboard without other changes.
 */

import { useState, useCallback } from 'react';
import { syncWalletExtension } from '../services/extension-wallet-sync';
import { useUTXOs } from '@/stores/utxoStore';
import { useCharmsStore } from '@/stores/charms';
import { useBlockchain } from '@/stores/blockchainStore';
import { saveCharms } from '@/services/storage';

export function useExtensionWalletSync() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState({ phase: null, current: 0, total: 0 });
    const [syncError, setSyncError] = useState(null);

    const { refreshUTXOs } = useUTXOs();
    const addCharm = useCharmsStore(state => state.addCharm);
    const { activeBlockchain, activeNetwork } = useBlockchain();

    /**
     * Full wallet sync using external API for charms
     */
    const syncFullWallet = useCallback(async () => {
        if (isSyncing) return;

        setIsSyncing(true);
        setSyncError(null);
        setSyncProgress({ phase: 'utxos', current: 0, total: 0 });

        // Clear storage FIRST, then Zustand store — avoids race condition where
        // clearCharms() sets initialized=false, triggering useCharms hook to
        // re-init from stale cache before sync clears storage.
        await saveCharms([], activeBlockchain, activeNetwork);
        useCharmsStore.setState({ charms: [], pendingCharms: [] });

        try {
            const result = await syncWalletExtension({
                blockchain: activeBlockchain,
                network: activeNetwork,
                fullScan: true,
                skipCharms: false,
                addressLimit: 12,
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
     * Charms-only refresh using external API
     */
    const syncCharmsOnly = useCallback(async () => {
        if (isSyncing) return;

        setIsSyncing(true);
        setSyncError(null);

        // Clear storage FIRST, then Zustand store (same race condition fix)
        await saveCharms([], activeBlockchain, activeNetwork);
        useCharmsStore.setState({ charms: [], pendingCharms: [] });

        try {
            const result = await syncWalletExtension({
                blockchain: activeBlockchain,
                network: activeNetwork,
                fullScan: true,
                skipCharms: false,
                addressLimit: 12,
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
     * UTXO-only refresh (no charms)
     */
    const syncUTXOs = useCallback(async (addressLimit = null) => {
        if (isSyncing) return;

        setIsSyncing(true);
        setSyncError(null);

        try {
            const result = await syncWalletExtension({
                blockchain: activeBlockchain,
                network: activeNetwork,
                fullScan: true,
                skipCharms: true,
                updateUTXOStore: refreshUTXOs,
                addressLimit
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
        }
    }, [isSyncing, activeBlockchain, activeNetwork, refreshUTXOs]);

    return {
        isSyncing,
        syncProgress,
        syncError,
        syncFullWallet,
        syncCharmsOnly,
        syncUTXOs,
    };
}
