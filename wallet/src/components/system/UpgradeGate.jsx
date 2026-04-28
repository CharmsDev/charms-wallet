'use client';

import { useEffect, useState } from 'react';
import { ensureStorageVersion } from '@/services/storage-version';
import { rehydrateAddressesIfNeeded } from '@/services/wallet/rehydrate';

/**
 * UpgradeGate
 *
 * Wraps the entire app. On first mount:
 *   1. Compare persisted schema version vs CURRENT_VERSION
 *   2. If behind → wipe non-whitelisted keys (seed survives)
 *   3. Re-derive addresses from the seed for every supported chain+network
 *   4. Run an initial sync for the active blockchain so the dashboard
 *      mounts with real balance/UTXOs already populated
 *   5. Mount children
 *
 * The spinner stays visible across all four steps so the user sees a
 * single "upgrading" UX instead of an empty dashboard followed by a
 * separate refresh.
 */
export default function UpgradeGate({ children }) {
    const [status, setStatus] = useState('checking');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                // 1) Schema version check + wipe (whitelist preserves seed)
                const wiped = await ensureStorageVersion((phase) => {
                    if (!cancelled) setStatus(phase);
                });

                // 2) Always run rehydrate — idempotent. Catches the post-wipe
                // case AND any wallet that ended up with a seed but no
                // addresses. Existing addresses for a (chain, network) are
                // kept untouched.
                if (wiped && !cancelled) setStatus('upgrading');
                await rehydrateAddressesIfNeeded();

                // 3) Initial sync — only if we just wiped. Otherwise we let
                // the normal app flow handle refreshes (avoid duplicate sync
                // on every page load). Active blockchain only — the other
                // chain syncs lazily when the user switches.
                if (wiped) {
                    if (!cancelled) setStatus('upgrading');
                    try {
                        const { StorageAdapter } = await import('@/services/storage-adapter');
                        const { SYSTEM_KEYS } = await import('@/services/storage-keys');
                        const blockchain = (await StorageAdapter.get(SYSTEM_KEYS.ACTIVE_BLOCKCHAIN)) || 'bitcoin';
                        const network = (await StorageAdapter.get(SYSTEM_KEYS.ACTIVE_NETWORK)) || 'mainnet';

                        if (blockchain === 'cardano') {
                            // Cardano sync lives inside the cardanoStore; the
                            // dashboard's first effect will pick it up. No
                            // gate-time sync needed.
                        } else {
                            const { syncWalletExplorer } = await import('@/services/wallet/sync/explorer-wallet-sync');
                            const { syncTransactionHistory } = await import('@/services/wallet/sync/transactions-sync');

                            // 1) Balance + UTXOs + charms
                            await syncWalletExplorer({ blockchain, network, fullScan: true, skipCharms: false });
                            // 2) Tx history — full scan since this is the
                            //    first sync after wipe. syncTransactionHistory
                            //    decodes vin/vout and classifies inline before
                            //    saving, so storage holds final types.
                            await syncTransactionHistory({ blockchain, network, mode: 'full' });
                        }
                    } catch (e) {
                        console.warn('[upgrade] initial sync failed (non-fatal):', e?.message || e);
                    }
                }
            } catch (e) {
                console.error('[storage] version check failed:', e?.message || e);
            } finally {
                if (!cancelled) setStatus('ready');
            }
        })();
        return () => { cancelled = true; };
    }, []);

    if (status === 'checking') {
        // Render nothing for the brief moment before ensureStorageVersion
        // resolves. On a no-op (already on the latest version) this lasts
        // a few ms — no visible flash.
        return null;
    }

    if (status === 'upgrading') {
        return (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-dark-950/95 backdrop-blur-sm">
                <div className="text-center space-y-5 max-w-sm px-6">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto" />
                    <h2 className="text-xl font-semibold gradient-text">Upgrading wallet</h2>
                    <p className="text-sm text-dark-300">
                        Refreshing local data after a recent update. This usually takes a couple of seconds.
                    </p>
                    <p className="text-xs text-dark-500">
                        Your seed phrase is safe — only the cache is being rebuilt.
                    </p>
                </div>
            </div>
        );
    }

    return children;
}
