/**
 * One-shot migration: re-extract charm metadata for txs already in storage.
 *
 * v1.3.27 and earlier populated `charmTokenData` via the deprecated
 * `/v1/charms/{txid}` endpoint, which 404'd on non-charm txs and skipped
 * metadata for any tx that the legacy flow couldn't classify. v1.3.28
 * switches to `/v1/transactions/{txid}` (charm.detected + assets[] inline).
 *
 * This migration runs once per (blockchain, network) per wallet. It calls
 * the existing reprocess loop, which now uses the new endpoint, refreshing
 * `charmTokenData` for all stored txs. Idempotent — a `migrationVersion`
 * flag in sync_meta prevents re-runs.
 *
 * Storage shape is NOT modified by this migration; only field values are
 * refreshed. Prod wallets keep all their existing data.
 */

import { getSyncMeta, saveSyncMeta, getAddresses } from '@/services/storage';

const FLAG = 'v1.3.28-charm-extractor';

export async function migrateCharmMetadataIfNeeded(blockchain, network) {
    if (!blockchain || !network) return false;
    const meta = await getSyncMeta(blockchain, network);
    if (meta?.migrationVersion === FLAG) return false;

    try {
        const addresses = await getAddresses(blockchain, network);
        const { useTransactionStore } = await import('@/stores/transactionStore');
        await useTransactionStore.getState().reprocessCharmTransactions(blockchain, network, addresses);
        await saveSyncMeta({ ...meta, migrationVersion: FLAG }, blockchain, network);
        console.log('[Migration] charm metadata refreshed via /v1/transactions/{txid}');
        return true;
    } catch (e) {
        console.warn('[Migration] charm metadata refresh failed:', e?.message);
        return false;
    }
}
