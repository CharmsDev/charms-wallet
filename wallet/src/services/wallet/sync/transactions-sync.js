/**
 * Transaction History Sync (Bitcoin)
 *
 * Single round trip via POST /v1/wallet/transactions/batch — replaces the
 * legacy per-address GET loop and the per-tx /v1/charms/{txid} enrichment
 * (the latter was 404'ing on every non-charm tx).
 *
 * Incremental mode uses a stored `lastSyncBlock` watermark so subsequent
 * refreshes only fetch new history.
 */

import {
    getAddresses,
    getTransactions,
    saveTransactions,
    getSyncMeta,
    saveSyncMeta,
} from '@/services/storage';
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';

const BATCH_LIMIT = 50; // backend cap on /v1/wallet/transactions/batch

/**
 * Sync BTC tx history. Reads addresses from local storage, calls
 * transactions/batch, merges results into the existing tx store
 * (preserving the legacy entry shape so prod wallets keep working).
 *
 * @param {object} opts
 * @param {string} opts.blockchain  — defaults to bitcoin (cardano is a no-op)
 * @param {string} opts.network     — defaults to mainnet
 * @param {'incremental'|'full'} opts.mode  — defaults to 'incremental'
 * @returns {Promise<{ newTxCount: number, lastBlock: number|null }>}
 */
export async function syncTransactionHistory({
    blockchain = BLOCKCHAINS.BITCOIN,
    network = NETWORKS.BITCOIN.MAINNET,
    mode = 'incremental',
} = {}) {
    if (blockchain === BLOCKCHAINS.CARDANO) return { newTxCount: 0, lastBlock: null };

    const { explorerWalletService } = await import('@/services/shared/explorer-wallet-service');
    if (!explorerWalletService.isAvailable(network)) return { newTxCount: 0, lastBlock: null };

    const stored = await getAddresses(blockchain, network);
    const addressList = stored
        .filter(a => !a.blockchain || a.blockchain === blockchain)
        .map(a => a.address);
    if (addressList.length === 0) return { newTxCount: 0, lastBlock: null };

    const meta = mode === 'incremental' ? await getSyncMeta(blockchain, network) : {};
    const sinceBlock = mode === 'incremental' ? (meta.lastSyncBlock ?? null) : null;

    const aggregated = new Map(); // txid → { tx, addresses:Set }
    let maxBlock = sinceBlock || 0;

    let charmDetected = 0, withAssets = 0, totalSeen = 0;
    let loggedShape = false;
    for (let i = 0; i < addressList.length; i += BATCH_LIMIT) {
        const chunk = addressList.slice(i, i + BATCH_LIMIT);
        const data = await explorerWalletService.getBatchTransactions(chunk, network, { sinceBlock });
        for (const [addr, result] of Object.entries(data?.results || {})) {
            if (result?.error) continue;
            for (const tx of (result.transactions || [])) {
                totalSeen++;
                if (tx.charm_detected) charmDetected++;
                if (Array.isArray(tx.assets) && tx.assets.length) withAssets++;
                if (!loggedShape) {
                    loggedShape = true;
                    console.log(`[tx-sync] /transactions/batch tx shape: ${Object.keys(tx).join(',')}`);
                }
                if (!aggregated.has(tx.txid)) aggregated.set(tx.txid, { tx, addresses: new Set() });
                aggregated.get(tx.txid).addresses.add(addr);
                if (tx.block_height && tx.block_height > maxBlock) maxBlock = tx.block_height;
            }
            if (result.last_block && result.last_block > maxBlock) maxBlock = result.last_block;
        }
    }
    console.log(`[tx-sync] indexer hints: total=${totalSeen} charm.detected=${charmDetected} withAssets=${withAssets}`);

    const localTxs = await getTransactions(blockchain, network);
    const localByTxid = new Map(localTxs.map(t => [t.txid, t]));

    // Known charm app IDs for richer initial type assignment.
    const EBTC_APP_ID = '0796f63ed48144b4ec69fb794fbc2290ae63acf945fb035d5474648b50ee43b6';
    const BRO_APP_ID  = '3d7fe7e4cea6121947af73d70e5119bebd8aa5b7edfe74bfaf6e779a1847bd9b';
    const matchesApp = (appIds, needle) => (appIds || []).some(id => typeof id === 'string' && id.includes(needle));

    /**
     * Map indexer hints (charm.detected + asset_app_ids + direction) to a
     * best-effort tx type. The classifier in `reprocess` will refine this
     * when it has full vin/vout (e.g. distinguishing BEAM_IN from
     * CHARM_RECEIVED via placeholder consumption). But when the decoder
     * 404s on a parent, this initial type still gives the UI a meaningful
     * label instead of "Received Bitcoin".
     */
    const initialTypeFor = (tx) => {
        const dir = tx.direction === 'in' ? 'in' : 'out';
        if (!tx.charm_detected) return dir === 'in' ? 'received' : 'sent';
        const appIds = (tx.assets || []).map(a => a.app_id);
        if (matchesApp(appIds, EBTC_APP_ID)) return dir === 'in' ? 'ebtc_redeem' : 'ebtc_lock';
        if (matchesApp(appIds, BRO_APP_ID))  return dir === 'in' ? 'charm_received' : 'charm_sent';
        return dir === 'in' ? 'charm_received' : 'charm_sent';
    };

    let added = 0;
    let updated = 0;
    let typeUpgraded = 0;
    const GENERIC_TYPES = new Set(['received', 'sent']);

    for (const [txid, { tx, addresses }] of aggregated) {
        const initialType = initialTypeFor(tx);

        if (localByTxid.has(txid)) {
            // Refresh confirmation/block AND upgrade type if the indexer
            // now reports a charm hint that the existing entry doesn't yet
            // reflect (e.g. wallet was wiped + resynced before this code
            // shipped, leaving everything as plain `received`/`sent`).
            const existing = localByTxid.get(txid);
            const newConfs = tx.confirmations ?? existing.confirmations;
            const newHeight = tx.block_height ?? existing.blockHeight;
            const newStatus = (tx.confirmations || 0) >= 1 ? 'confirmed' : 'pending';

            const shouldUpgradeType = !GENERIC_TYPES.has(initialType) && GENERIC_TYPES.has(existing.type);
            if (shouldUpgradeType) {
                existing.type = initialType;
                typeUpgraded++;
            }

            if (newConfs !== existing.confirmations || newHeight !== existing.blockHeight || newStatus !== existing.status) {
                existing.confirmations = newConfs;
                existing.blockHeight = newHeight;
                existing.status = newStatus;
                updated++;
            }
            continue;
        }

        const entry = {
            id: `tx_${Date.now()}_${initialType}_${added}`,
            txid: tx.txid,
            type: initialType,
            amount: tx.amount || 0,
            fee: tx.fee || 0,
            timestamp: (tx.block_time ? tx.block_time * 1000 : Date.now()),
            status: (tx.confirmations || 0) >= 1 ? 'confirmed' : 'pending',
            addresses: tx.direction === 'in'
                ? { received: addresses.values().next().value || null }
                : { from: Array.from(addresses) },
            blockHeight: tx.block_height ?? null,
            confirmations: tx.confirmations || 0,
        };

        // Indexer is authoritative for charm detection — populate charmTokenData
        // inline (or set to null so reprocess knows it has been checked).
        if (tx.charm_detected && Array.isArray(tx.assets) && tx.assets.length) {
            const asset = tx.assets[0];
            entry.charmTokenData = {
                appId: asset.app_id,
                tokenName: asset.name || null,
                tokenTicker: asset.symbol || null,
                tokenAmount: asset.amount || 0,
                tokenImage: null,
            };
        } else {
            entry.charmTokenData = null;
        }

        localTxs.push(entry);
        added++;
    }

    if (added > 0 || updated > 0 || typeUpgraded > 0) {
        await saveTransactions(localTxs, blockchain, network);
    }
    if (maxBlock > 0) {
        await saveSyncMeta({ lastSyncBlock: maxBlock, lastSyncTs: Date.now() }, blockchain, network);
    }

    console.log(`[tx-sync] new=${added} updated=${updated} typeUpgraded=${typeUpgraded} total=${localTxs.length}`);

    // Reclassify INLINE so storage holds final types (BEAM_IN/BEAM_OUT/etc.)
    // before the UI ever reads it. Previously this ran on the History page
    // mount, which is why users briefly saw generic "received/sent" labels
    // that flipped to the proper ones a moment later.
    try {
        const { useTransactionStore } = await import('@/stores/transactionStore');
        await useTransactionStore.getState().reprocessCharmTransactions(blockchain, network, stored);
    } catch (e) {
        console.warn('[tx-sync] inline classify failed (non-fatal):', e?.message || e);
    }

    return { newTxCount: added, lastBlock: maxBlock || null, typeUpgraded };
}
