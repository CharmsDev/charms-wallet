/**
 * useExtensionWalletSync Hook (Extension-only)
 *
 * Thin popup-facing wrapper over the wallet's own sync service. It only
 * owns the progress/error UI state the popup renders; all fetching and
 * persistence is the shared `syncWalletExplorer`.
 *
 * The extension used to carry its own `extension-wallet-sync.js`, which
 * drifted onto the deprecated utxos/batch + charms/batch endpoints and
 * therefore never saw the charm metadata (name, imageUrl, description)
 * that only balance/batch returns. Using the wallet service directly
 * removes the drift by construction.
 */

import { useState, useCallback, useRef } from 'react';
import { syncWalletExplorer } from '@/services/wallet/sync/explorer-wallet-sync';
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
            const result = await syncWalletExplorer({
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
                onCharmFound: addCharm,
                updateUTXOStore: refreshUTXOs
            });

            if (!result.success) {
                throw new Error(result.error || 'Sync failed');
            }

            // Transaction history sync is also what reconciles the
            // BalanceService: it looks up each live pending by txid and
            // walks it to confirmed once the indexer reports a block.
            // Without this on the main refresh, a pending would only clear
            // if the user happened to open the Activity tab, which is
            // where the extension called it until now. The wallet's
            // dashboard refresh does the same pair.
            if (activeBlockchain !== 'cardano') {
                try {
                    const { syncTransactionHistory } = await import('@/services/wallet/sync/transactions-sync');
                    await syncTransactionHistory({
                        blockchain: activeBlockchain,
                        network: activeNetwork,
                        mode: 'incremental',
                    });
                } catch (e) {
                    console.warn('[ExtSync] tx history sync failed (non-fatal):', e?.message || e);
                }
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
            const result = await syncWalletExplorer({
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
            const result = await syncWalletExplorer({
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
