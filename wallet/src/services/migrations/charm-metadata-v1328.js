/**
 * One-shot migration: re-decode every stored tx via the new helper that
 * resolves prevout addresses + decodes outputs in sats with proper
 * OP_RETURN detection.
 *
 * Why: v1.3.27/28 parsed `/v1/wallet/tx/{txid}` (RPC verbose) as if it
 * were mempool.space format — wrong field names AND wrong units. Result:
 *   - inputs[].address always null  → UI shows "Unknown"
 *   - outputs[].address always null → UI shows "OP_RETURN" for everything
 *   - amount stayed at the indexer's 0 because tx.amount never got recomputed
 *   - classifier failed (CHARM_RECEIVED/SENT/EBTC_REDEEM detection needs vin)
 *
 * Fix runs once per (blockchain, network). Clears the `detailsChecked`
 * flag so reprocessCharmTransactions re-fetches with the new decoder.
 * Storage shape is preserved — only values are refreshed.
 */

import {
    getSyncMeta,
    saveSyncMeta,
    getAddresses,
    getTransactions,
    saveTransactions,
} from '@/services/storage';

const FLAG = 'v1.3.30-decoded-tx';

export async function migrateCharmMetadataIfNeeded(blockchain, network) {
    if (!blockchain || !network) return false;
    const meta = await getSyncMeta(blockchain, network);
    if (meta?.migrationVersion === FLAG) return false;

    try {
        // 1) Clear stale per-tx flags so the decoder runs fresh on every entry.
        const txs = await getTransactions(blockchain, network);
        for (const tx of txs) {
            tx.detailsChecked = false;
            tx.charmChecked = false;
        }
        await saveTransactions(txs, blockchain, network);

        // 2) Run reprocess — fetches decoded vin/vout, recalculates amount,
        //    re-runs classifier with full data, refreshes charmTokenData.
        const addresses = await getAddresses(blockchain, network);
        const { useTransactionStore } = await import('@/stores/transactionStore');
        await useTransactionStore.getState().reprocessCharmTransactions(blockchain, network, addresses);

        await saveSyncMeta({ ...meta, migrationVersion: FLAG }, blockchain, network);
        console.log('[Migration] tx history re-decoded via getDecodedTransaction');
        return true;
    } catch (e) {
        console.warn('[Migration] re-decode failed:', e?.message);
        return false;
    }
}
