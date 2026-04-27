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

    // One-shot: refresh charm metadata for txs saved by older versions
    // (which used the deprecated /v1/charms/{txid}). No-op after first run.
    try {
        const { migrateCharmMetadataIfNeeded } = await import('@/services/migrations/charm-metadata-v1328');
        await migrateCharmMetadataIfNeeded(blockchain, network);
    } catch { /* migration is best-effort, never blocks sync */ }

    const stored = await getAddresses(blockchain, network);
    const addressList = stored
        .filter(a => !a.blockchain || a.blockchain === blockchain)
        .map(a => a.address);
    if (addressList.length === 0) return { newTxCount: 0, lastBlock: null };

    const meta = mode === 'incremental' ? await getSyncMeta(blockchain, network) : {};
    const sinceBlock = mode === 'incremental' ? (meta.lastSyncBlock ?? null) : null;

    const aggregated = new Map(); // txid → { tx, addresses:Set }
    let maxBlock = sinceBlock || 0;

    for (let i = 0; i < addressList.length; i += BATCH_LIMIT) {
        const chunk = addressList.slice(i, i + BATCH_LIMIT);
        const data = await explorerWalletService.getBatchTransactions(chunk, network, { sinceBlock });
        for (const [addr, result] of Object.entries(data?.results || {})) {
            if (result?.error) continue;
            for (const tx of (result.transactions || [])) {
                if (!aggregated.has(tx.txid)) aggregated.set(tx.txid, { tx, addresses: new Set() });
                aggregated.get(tx.txid).addresses.add(addr);
                if (tx.block_height && tx.block_height > maxBlock) maxBlock = tx.block_height;
            }
            if (result.last_block && result.last_block > maxBlock) maxBlock = result.last_block;
        }
    }

    const localTxs = await getTransactions(blockchain, network);
    const localByTxid = new Map(localTxs.map(t => [t.txid, t]));

    let added = 0;
    let updated = 0;
    for (const [txid, { tx, addresses }] of aggregated) {
        const initialType = tx.direction === 'in' ? 'received' : 'sent';

        if (localByTxid.has(txid)) {
            // Refresh confirmation/block — keep classifier-derived type as-is
            // (reprocessCharmTransactions handles type updates with full vin/vout).
            const existing = localByTxid.get(txid);
            const newConfs = tx.confirmations ?? existing.confirmations;
            const newHeight = tx.block_height ?? existing.blockHeight;
            const newStatus = (tx.confirmations || 0) >= 1 ? 'confirmed' : 'pending';
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
            // Indexer is authoritative for charm detection — no second fetch needed.
            // `charmChecked: true` short-circuits the reprocess loop so we never
            // re-query /v1/transactions/{txid} on subsequent refreshes.
            charmChecked: true,
        };

        if (tx.charm?.detected && Array.isArray(tx.assets) && tx.assets.length) {
            const asset = tx.assets[0];
            entry.charmTokenData = {
                appId: asset.app_id,
                tokenName: asset.name || null,
                tokenTicker: asset.symbol || null,
                tokenAmount: asset.amount || 0,
                tokenImage: null,
            };
        }

        localTxs.push(entry);
        added++;
    }

    if (added > 0 || updated > 0) {
        await saveTransactions(localTxs, blockchain, network);
    }
    if (maxBlock > 0) {
        await saveSyncMeta({ lastSyncBlock: maxBlock, lastSyncTs: Date.now() }, blockchain, network);
    }

    return { newTxCount: added, lastBlock: maxBlock || null };
}
