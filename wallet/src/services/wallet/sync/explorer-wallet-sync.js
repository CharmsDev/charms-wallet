/**
 * Explorer Wallet Sync Service (Web Wallet)
 *
 * PRIMARY FLOW: Charms Explorer indexed API
 *   - GET /v1/wallet/utxos/{address}  → instant UTXOs + BTC balance
 *   - GET /v1/wallet/charms/{address} → instant charm/token balances
 *   - UTXO sync runs after for spending capability
 *
 * FAILOVER: If Explorer API is unavailable → FallbackProvider (mempool.space + prover)
 */

import { getAddresses, saveCharms, saveBalance } from '@/services/storage';
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';
import { syncUTXOs } from './utxo-sync';
import { isPotentialCharm, isCharmUtxo } from '@/services/utxo/utils/charms';

// ============================================
// Known token metadata (mirrors extension)
// ============================================

const KNOWN_TOKENS = {
    't/3d7fe7e4cea6121947af73d70e5119bebd8aa5b7edfe74bfaf6e779a1847bd9b/c975d4e0c292fb95efbda5c13312d6ac1d8b5aeff7f0f1e5578645a2da70ff5f': {
        name: 'Bro', ticker: '$BRO', decimals: 8, type: 'token',
        image: 'https://bro.charms.dev/assets/bro-token-DsXLIv23.jpg',
    },
};

// ============================================
// Helpers
// ============================================

/**
 * Convert an Explorer API charm UTXO into the wallet's CharmObj format.
 */
function toCharmObj(utxo, balanceEntry) {
    const appId = utxo.appId || utxo.app_id;
    const known = KNOWN_TOKENS[appId];
    const decimals = known?.decimals || 0;
    const rawAmount = utxo.amount || 0;
    const displayAmount = decimals > 0 ? rawAmount / Math.pow(10, decimals) : rawAmount;
    const displayAmountStr = Number.isInteger(displayAmount)
        ? String(displayAmount)
        : displayAmount.toFixed(8).replace(/\.?0+$/, '');

    return {
        txid: utxo.txid,
        outputIndex: utxo.vout,
        address: utxo.address,
        appId,
        amount: rawAmount,
        displayAmount: displayAmountStr,
        decimals,
        type: known?.type || balanceEntry?.assetType || balanceEntry?.asset_type || 'token',
        name: known?.name || balanceEntry?.symbol || 'Unknown Token',
        ticker: known?.ticker || balanceEntry?.symbol || 'TOKEN',
        image: known?.image || null,
        description: '',
        isBroToken: !!known,
        metadata: {
            name: known?.name || balanceEntry?.symbol || 'Unknown Token',
            ticker: known?.ticker || balanceEntry?.symbol || 'TOKEN',
            image: known?.image || null,
        },
    };
}

// ============================================
// Primary sync (Explorer API)
// ============================================

/**
 * Adapter: balance/batch UTXO row → wallet's internal UTXO shape.
 * Balance endpoint omits `address` (implicit from outer key) and `confirmations`
 * (we derive from `confirmed: bool` + chain tip).
 */
function adaptBalanceUtxo(u, address, currentHeight) {
    const confirmed = u.confirmed === true;
    const blockHeight = u.blockHeight ?? null;
    const confirmations = confirmed && blockHeight && currentHeight
        ? Math.max(1, currentHeight - blockHeight + 1)
        : (confirmed ? 1 : 0);
    return {
        txid: u.txid,
        vout: u.vout,
        value: u.value,
        address,
        confirmations,
        blockHeight,
        coinbase: false,
        hasCharms: u.hasCharms === true,
        status: {
            confirmed,
            block_height: blockHeight,
            block_hash: null,
            block_time: null,
        },
    };
}

/**
 * Aggregate balance/batch result into the same `(utxos, charmBalances)` pair
 * that the legacy code path produced. Charm balances are merged across
 * addresses by appId.
 */
function aggregateBalanceBatch(data, currentHeight, skipCharms) {
    const utxos = [];
    const charmMap = {};
    for (const [addr, result] of Object.entries(data?.results || {})) {
        if (result?.error) continue;
        for (const u of (result.btc?.utxos || [])) {
            utxos.push(adaptBalanceUtxo(u, addr, currentHeight));
        }
        if (skipCharms) continue;
        for (const b of (result.charms?.balances || [])) {
            const key = b.appId || b.app_id;
            if (!charmMap[key]) {
                charmMap[key] = {
                    appId: key,
                    assetType: b.assetType || b.asset_type || 'token',
                    symbol: b.symbol || '',
                    confirmed: 0, unconfirmed: 0, total: 0,
                    utxos: [],
                };
            }
            charmMap[key].confirmed += b.confirmed || 0;
            charmMap[key].unconfirmed += b.unconfirmed || 0;
            charmMap[key].total += b.total || 0;
            // Inject appId + outer address onto each utxo (legacy shape).
            charmMap[key].utxos.push(...(b.utxos || []).map(u => ({
                appId: key, address: addr, ...u,
            })));
        }
    }
    return { utxos, charmBalances: Object.values(charmMap) };
}

/**
 * Fetch balance + charms from the Explorer indexed API.
 * Single round trip via balance/batch (UTXOs + charms inline). Failures
 * propagate — there is no legacy fallback; the deprecated endpoints are
 * not part of this client.
 *
 * Returns { balanceResult, charms, tokenBalances, utxos }.
 */
async function fetchFromExplorerAPI(explorerService, addressList, network, skipCharms) {
    const [batchData, tip] = await Promise.all([
        explorerService.getBatchBalance(addressList, network),
        explorerService.getTip(network).catch(() => ({ height: null })),
    ]);
    const { utxos, charmBalances } = aggregateBalanceBatch(batchData, tip?.height || null, skipCharms);

    // Normalize charms — used for isCharmUtxo check below
    const charms = [];
    const seenKeys = new Set();
    if (!skipCharms && Array.isArray(charmBalances)) {
        console.log('[ExplorerSync] charm balances from indexer:',
            charmBalances.map(b => ({
                appId: b.appId, symbol: b.symbol, total: b.total,
                utxoCount: (b.utxos || []).length,
            })));
        for (const balance of charmBalances) {
            for (const utxo of (balance.utxos || [])) {
                const key = `${utxo.txid}:${utxo.vout}`;
                if (seenKeys.has(key)) continue;
                seenKeys.add(key);
                charms.push(toCharmObj(utxo, balance));
            }
        }
    }

    // Spendable BTC = UTXOs that don't carry charms. Prefer the indexer's
    // `hasCharms` flag (source of truth) when present; fall back to the
    // ≤1000-sats heuristic for legacy responses.
    let confirmed = 0, unconfirmed = 0;
    for (const utxo of utxos) {
        const isCharm = utxo.hasCharms === true
            || isPotentialCharm(utxo)
            || isCharmUtxo(utxo, charms);
        if (isCharm) continue;
        const sats = utxo.value || 0;
        if ((utxo.confirmations || 0) >= 1) confirmed += sats;
        else unconfirmed += sats;
    }
    const balanceResult = { confirmed, unconfirmed, total: confirmed + unconfirmed };

    const tokenBalances = (Array.isArray(charmBalances) ? charmBalances : []).map(b => ({
        appId: b.appId,
        name: KNOWN_TOKENS[b.appId]?.name || b.symbol || 'Unknown',
        ticker: KNOWN_TOKENS[b.appId]?.ticker || b.symbol || 'TOKEN',
        amount: b.total || 0,
    }));

    return { balanceResult, charms, tokenBalances, utxos };
}

/**
 * Persist balance + charms to storage and Zustand stores.
 */
async function applyResults(balanceResult, charms, tokenBalances, blockchain, network, onPhase1Complete, onCharmFound) {
    // 1. Persist to storage FIRST (always works, no React dependency)
    await saveCharms(charms, blockchain, network);
    await saveBalance(blockchain, network, {
        spendable: balanceResult.confirmed || 0,
        pending: balanceResult.unconfirmed || 0,
        nonSpendable: 0,
        utxoCount: 0,
        charmCount: charms.length,
        ordinalCount: 0,
        runeCount: 0,
        tokens: tokenBalances,
    });

    // 2. Update Zustand stores (may fail outside React context — non-fatal)
    try {
        const { useUTXOStore } = await import('@/stores/utxoStore');
        useUTXOStore.setState({
            totalBalance: balanceResult.confirmed || 0,
            pendingBalance: balanceResult.unconfirmed || 0,
        });
    } catch (e) {
        console.warn('[ExplorerWalletSync] UTXO store update skipped:', e.message);
    }

    try {
        const { useCharmsStore } = await import('@/stores/charms');
        useCharmsStore.setState({
            charms,
            initialized: true,
            isLoading: false,
            currentNetwork: `${blockchain}-${network}`,
        });
    } catch (e) {
        console.warn('[ExplorerWalletSync] Charms store update skipped:', e.message);
    }

    // 3. Phase1 callback (balance ready notification — no charm iteration to avoid render loops)
    try {
        if (onPhase1Complete) {
            onPhase1Complete({
                spendable: balanceResult.confirmed || 0,
                pending: balanceResult.unconfirmed || 0,
                utxosUpdated: 0,
            });
        }
    } catch (e) {
        console.warn('[ExplorerWalletSync] Callback error:', e.message);
    }
}

// ============================================
// Main entry point
// ============================================

export async function syncWalletExplorer(options = {}) {
    const {
        addresses = null,
        blockchain = BLOCKCHAINS.BITCOIN,
        network = NETWORKS.BITCOIN.MAINNET,
        fullScan = false,
        skipCharms = false,
        onUTXOProgress = null,
        onCharmFound = null,
        updateUTXOStore = null,
        addressLimit = null,
        onPhase1Complete = null,
    } = options;

    const result = {
        success: false,
        utxosUpdated: 0,
        charmsFound: 0,
        charmsRemoved: 0,
        totalBalance: 0,
        error: null,
    };

    const _ts = () => new Date().toISOString().slice(11, 23);
    console.log(`[${_ts()}] [ExplorerWalletSync] ▶ Sync started (network=${network}, fullScan=${fullScan})`);

    try {
        const { explorerWalletService } = await import('@/services/shared/explorer-wallet-service');
        const explorerAvailable = explorerWalletService.isAvailable(network);

        const storedAddresses = await getAddresses(blockchain, network);
        const addressList = storedAddresses
            .filter(a => !a.blockchain || a.blockchain === blockchain)
            .map(a => a.address);

        console.log(`[${_ts()}] [ExplorerWalletSync] Explorer=${explorerAvailable}, addresses=${addressList.length}`);
        console.log(`[${_ts()}] [ExplorerWalletSync] Address list:`, addressList);

        // ============================================
        // Explorer indexed API (the only data source)
        // ============================================
        if (!explorerAvailable) {
            // Surface a clear error instead of silently falling back to
            // mempool.space — the wallet is Explorer-only by design.
            result.error = 'Explorer API unavailable. Try again in a moment.';
            console.warn(`[${_ts()}] [ExplorerWalletSync] ${result.error}`);
            return result;
        }

        if (addressList.length > 0) {
            // Step 1: Fetch data from Explorer API. Errors propagate — no
            // silent fallback to mempool.space.
            const t0 = performance.now();
            const fetchedData = await fetchFromExplorerAPI(explorerWalletService, addressList, network, skipCharms);
            const ms = (performance.now() - t0).toFixed(0);
            console.log(`[${_ts()}] [ExplorerWalletSync] ⚡ Explorer API: ${ms}ms — balance=${fetchedData.balanceResult.total} sats, charms=${fetchedData.charms.length}`);

            // Step 2: Save UTXOs from batch result (no separate sync needed)
            try {
                const { saveUTXOs } = await import('@/services/storage');
                const utxoMap = {};
                for (const utxo of fetchedData.utxos) {
                    const addr = utxo.address;
                    if (!addr) continue;
                    if (!utxoMap[addr]) utxoMap[addr] = [];
                    utxoMap[addr].push(utxo);
                }
                await saveUTXOs(utxoMap, blockchain, network);
                result.utxosUpdated = fetchedData.utxos.length;
                console.log(`[${_ts()}] [ExplorerWalletSync] UTXOs saved: ${fetchedData.utxos.length} across ${Object.keys(utxoMap).length} addresses`);

                // Update Zustand store so UTXOs tab reflects immediately
                try {
                    const { useUTXOStore } = await import('@/stores/utxoStore');
                    useUTXOStore.setState({ utxos: utxoMap, initialized: true });
                } catch (e) { /* non-fatal */ }
            } catch (err) {
                console.warn(`[${_ts()}] [ExplorerWalletSync] UTXO save error (non-fatal): ${err.message}`);
            }

            // Step 3: Apply balance + charms to stores (never triggers fallback)
            try {
                await applyResults(fetchedData.balanceResult, fetchedData.charms, fetchedData.tokenBalances, blockchain, network, onPhase1Complete, onCharmFound);
            } catch (err) {
                console.warn(`[${_ts()}] [ExplorerWalletSync] Store update error (non-fatal): ${err.message}`);
            }

            result.totalBalance = fetchedData.balanceResult.total || 0;
            result.charmsFound = fetchedData.charms.length;

            console.log(`[${_ts()}] [ExplorerWalletSync] ■ Complete: balance=${result.totalBalance}, utxos=${result.utxosUpdated}, charms=${result.charmsFound}`);
            result.success = true;
            return result;
        }

        // No addresses — nothing to sync
        result.success = true;
        return result;

    } catch (error) {
        console.error('[ExplorerWalletSync] Error:', error);
        result.error = error.message;
        return result;
    }
}
