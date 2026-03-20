/**
 * useExtensionWalletSync Hook (Extension-only)
 * 
 * Drop-in replacement for useWalletSync that uses the external
 * prover verify API for charm extraction instead of WASM.
 * 
 * This hook has the same interface as the core useWalletSync
 * so it can be swapped in ExtensionDashboard without other changes.
 */

import { useState, useCallback, useRef } from 'react';
import { syncWalletExtension } from '../services/extension-wallet-sync';
import { useUTXOs } from '@/stores/utxoStore';
import { useCharmsStore } from '@/stores/charms';
import { useBlockchain } from '@/stores/blockchainStore';

export function useExtensionWalletSync() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState({ phase: null, current: 0, total: 0 });
    const [syncError, setSyncError] = useState(null);
    const [syncPhase, setSyncPhase] = useState(null); // 'utxos' | 'charms' | null

    const syncingRef = useRef(false);
    const { refreshUTXOs } = useUTXOs();
    const addCharm = useCharmsStore(state => state.addCharm);
    const { activeBlockchain, activeNetwork } = useBlockchain();

    /**
     * Full wallet sync using external API for charms
     */
    const syncFullWallet = useCallback(async () => {
        if (syncingRef.current) return;
        syncingRef.current = true;

        setIsSyncing(true);
        setSyncError(null);
        setSyncPhase('utxos');
        setSyncProgress({ phase: 'utxos', current: 0, total: 0 });

        try {
            const result = await syncWalletExtension({
                blockchain: activeBlockchain,
                network: activeNetwork,
                fullScan: true,
                skipCharms: false,
                onUTXOProgress: (progress) => {
                    setSyncProgress({
                        phase: 'utxos',
                        current: progress.processed || 0,
                        total: progress.total || 0
                    });
                },
                onPhase1Complete: () => {
                    // BTC balance is now updated in the store — switch phase indicator
                    setSyncPhase('charms');
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
            setSyncPhase(null);
            setSyncProgress({ phase: null, current: 0, total: 0 });
        }
    }, [activeBlockchain, activeNetwork, refreshUTXOs, addCharm]);

    /**
     * Charms-only refresh using external API
     */
    const syncCharmsOnly = useCallback(async () => {
        if (syncingRef.current) return;
        syncingRef.current = true;

        setIsSyncing(true);
        setSyncError(null);

        try {
            const result = await syncWalletExtension({
                blockchain: activeBlockchain,
                network: activeNetwork,
                fullScan: true,
                skipCharms: false,
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
    }, [activeBlockchain, activeNetwork, refreshUTXOs, addCharm]);

    /**
     * UTXO-only refresh (no charms)
     */
    const syncUTXOs = useCallback(async (addressLimit = null) => {
        if (syncingRef.current) return;
        syncingRef.current = true;

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
            syncingRef.current = false;
            setIsSyncing(false);
        }
    }, [activeBlockchain, activeNetwork, refreshUTXOs]);

    return {
        isSyncing,
        syncPhase,
        syncProgress,
        syncError,
        syncFullWallet,
        syncCharmsOnly,
        syncUTXOs,
    };
}
