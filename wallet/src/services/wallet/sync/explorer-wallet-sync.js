/**
 * Explorer Wallet Sync Service.
 *
 * Single source of truth: POST /v1/wallet/balance/batch (UTXOs + charms in
 * one round trip). On error the call propagates — there is no fallback to
 * mempool.space or any other external service.
 *
 * Callable with `skipCharms: true` for the UTXO-only refresh path: balance
 * + UTXOs are updated, charms storage is left untouched (no accidental wipe).
 */

import { getAddresses, saveCharms, saveBalance, getBalance } from '@/services/storage';
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';
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
        if (charmBalances.length > 0) {
            const summary = charmBalances
                .map(b => `${b.symbol || b.appId?.slice(2, 10)}=${b.total}(${(b.utxos || []).length})`)
                .join(' ');
            console.log(`[sync] charms ${summary}`);
        }
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
 *
 * `skipCharms` MUST match the value passed to fetchFromExplorerAPI. When
 * true, the `charms` array is empty (we never fetched them) and writing
 * it would wipe legitimate charm data — that was the source of the
 * "charms disappear after UTXO refresh" bug.
 */
async function applyResults(balanceResult, charms, tokenBalances, blockchain, network, onPhase1Complete, onCharmFound, skipCharms = false) {
    // 1a. Persist charms (only when included in this sync — never wipe).
    if (!skipCharms) {
        await saveCharms(charms, blockchain, network);
    }

    // 1b. Persist balance. When skipCharms, preserve previously-saved
    // charm-related fields (charmCount, tokens) so a UTXO-only refresh
    // doesn't blank them out.
    let charmCountToSave = charms?.length ?? 0;
    let tokensToSave = tokenBalances || [];
    if (skipCharms) {
        const existing = await getBalance(blockchain, network).catch(() => null);
        charmCountToSave = existing?.counts?.charms ?? 0;
        tokensToSave = existing?.tokens ?? [];
    }
    await saveBalance(blockchain, network, {
        spendable: balanceResult.confirmed || 0,
        pending: balanceResult.unconfirmed || 0,
        nonSpendable: 0,
        utxoCount: 0,
        charmCount: charmCountToSave,
        ordinalCount: 0,
        runeCount: 0,
        tokens: tokensToSave,
    });

    // 2. Update Zustand stores (may fail outside React context — non-fatal)
    try {
        const { useUTXOStore } = await import('@/stores/utxoStore');
        useUTXOStore.setState({
            totalBalance: balanceResult.confirmed || 0,
            pendingBalance: balanceResult.unconfirmed || 0,
        });
    } catch (e) {
        console.warn(`[sync] utxo store skipped: ${e.message}`);
    }

    if (!skipCharms) {
        try {
            const { useCharmsStore } = await import('@/stores/charms');
            useCharmsStore.setState({
                charms,
                initialized: true,
                isLoading: false,
                currentNetwork: `${blockchain}-${network}`,
            });
        } catch (e) {
            console.warn(`[sync] charms store skipped: ${e.message}`);
        }
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
        console.warn(`[sync] callback err: ${e.message}`);
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

    const t0 = performance.now();

    try {
        const { explorerWalletService } = await import('@/services/shared/explorer-wallet-service');
        const explorerAvailable = explorerWalletService.isAvailable(network);

        const storedAddresses = await getAddresses(blockchain, network);
        const addressList = storedAddresses
            .filter(a => !a.blockchain || a.blockchain === blockchain)
            .map(a => a.address);

        console.log(`[sync] start net=${network} addrs=${addressList.length} fullScan=${fullScan}`);

        // ============================================
        // Explorer indexed API (the only data source)
        // ============================================
        if (!explorerAvailable) {
            result.error = 'Explorer API unavailable. Try again in a moment.';
            console.warn(`[sync] ${result.error}`);
            return result;
        }

        if (addressList.length > 0) {
            const fetchedData = await fetchFromExplorerAPI(explorerWalletService, addressList, network, skipCharms);

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

                try {
                    const { useUTXOStore } = await import('@/stores/utxoStore');
                    useUTXOStore.setState({ utxos: utxoMap, initialized: true });
                } catch (e) { /* non-fatal */ }
            } catch (err) {
                console.warn(`[sync] utxo save error: ${err.message}`);
            }

            try {
                await applyResults(fetchedData.balanceResult, fetchedData.charms, fetchedData.tokenBalances, blockchain, network, onPhase1Complete, onCharmFound, skipCharms);
            } catch (err) {
                console.warn(`[sync] store update error: ${err.message}`);
            }

            result.totalBalance = fetchedData.balanceResult.total || 0;
            result.charmsFound = fetchedData.charms.length;

            const ms = (performance.now() - t0).toFixed(0);
            console.log(`[sync] done balance=${result.totalBalance} utxos=${result.utxosUpdated} charms=${result.charmsFound} ${ms}ms`);
            result.success = true;
            return result;
        }

        // No addresses — nothing to sync
        result.success = true;
        return result;

    } catch (error) {
        console.error(`[sync] error: ${error.message || error}`);
        result.error = error.message;
        return result;
    }
}
