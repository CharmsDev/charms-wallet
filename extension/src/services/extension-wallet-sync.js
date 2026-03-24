/**
 * Extension Wallet Sync Service
 *
 * PRIMARY FLOW: Charms Explorer indexed API (2 batch calls)
 *   - POST /v1/wallet/utxos/batch   → all UTXOs in one request
 *   - POST /v1/wallet/charms/batch  → all charm balances in one request
 *   - BTC balance calculated locally from UTXOs (≤1000 sats filtered as dust)
 *   - UTXOs saved to storage for spending capability
 *
 * FAILOVER: If Explorer API is unavailable → FallbackProvider (mempool.space + prover)
 */

import { getAddresses, saveCharms, saveBalance, saveUTXOs } from '@/services/storage';
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';

// ============================================
// Known token metadata
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
 * Fetch UTXOs + charms from the Explorer API using batch endpoints (2 POST calls).
 * BTC balance is calculated locally from UTXOs (≤1000 sats filtered as dust).
 * Returns { balanceResult, charms, tokenBalances, utxoMap }.
 */
async function fetchFromExplorerAPI(explorerService, addressList, network, skipCharms) {
    // 2 batch calls in parallel — replaces 2×N individual GET requests
    const [batchUtxoData, batchCharmData] = await Promise.all([
        explorerService.getBatchUTXOs(addressList, network),
        skipCharms ? { results: {} } : explorerService.getBatchCharmBalances(addressList, network),
    ]);

    // Flatten batch UTXO results into a flat array + utxoMap keyed by address
    const allUtxos = [];
    const utxoMap = {};
    for (const [addr, result] of Object.entries(batchUtxoData.results || {})) {
        if (result.error) continue;
        const utxos = (result.utxos || []).map(u => ({ ...u, address: u.address || addr }));
        if (utxos.length > 0) {
            utxoMap[addr] = utxos;
        }
        allUtxos.push(...utxos);
    }

    // Flatten batch charm results into the same format as getAggregateCharmBalances
    const charmBalances = [];
    if (!skipCharms) {
        for (const [, result] of Object.entries(batchCharmData.results || {})) {
            if (result.error) continue;
            for (const balance of (result.balances || [])) {
                charmBalances.push(balance);
            }
        }
    }

    // Build set of charm UTXO keys to exclude from BTC balance
    const charmUtxoKeys = new Set();
    for (const balance of charmBalances) {
        for (const utxo of (balance.utxos || [])) {
            charmUtxoKeys.add(`${utxo.txid}:${utxo.vout}`);
        }
    }

    // Calculate BTC balance locally from UTXOs (same logic as wallet web)
    let confirmed = 0;
    let unconfirmed = 0;
    for (const utxo of allUtxos) {
        const utxoKey = `${utxo.txid}:${utxo.vout}`;
        if (charmUtxoKeys.has(utxoKey)) continue;
        const sats = utxo.value || 0;
        if (sats <= 1000) continue; // dust filter
        if ((utxo.confirmations || 0) >= 1) {
            confirmed += sats;
        } else {
            unconfirmed += sats;
        }
    }
    const balanceResult = { confirmed, unconfirmed, total: confirmed + unconfirmed };

    // Normalize charms
    const charms = [];
    const seenKeys = new Set();
    for (const balance of charmBalances) {
        for (const utxo of (balance.utxos || [])) {
            const key = `${utxo.txid}:${utxo.vout}`;
            if (seenKeys.has(key)) continue;
            seenKeys.add(key);
            charms.push(toCharmObj(utxo, balance));
        }
    }

    // Build token balance summary
    const tokenBalances = charmBalances.map(b => ({
        appId: b.appId,
        name: KNOWN_TOKENS[b.appId]?.name || b.symbol || 'Unknown',
        ticker: KNOWN_TOKENS[b.appId]?.ticker || b.symbol || 'TOKEN',
        amount: b.total || 0,
    }));

    return { balanceResult, charms, tokenBalances, utxoMap };
}

/**
 * Persist balance + charms to storage and Zustand stores.
 */
async function applyResults(balanceResult, charms, tokenBalances, blockchain, network, onPhase1Complete, onCharmFound) {
    // Update BTC balance store
    const { useUTXOStore } = await import('@/stores/utxoStore');
    useUTXOStore.setState({
        totalBalance: balanceResult.confirmed || 0,
        pendingBalance: balanceResult.unconfirmed || 0,
    });

    if (onPhase1Complete) {
        onPhase1Complete({
            spendable: balanceResult.confirmed || 0,
            pending: balanceResult.unconfirmed || 0,
            utxosUpdated: 0,
        });
    }

    // Notify each charm found
    if (onCharmFound) {
        for (const charm of charms) {
            await onCharmFound(charm);
        }
    }

    // Save charms to storage + store
    await saveCharms(charms, blockchain, network);
    try {
        const { useCharmsStore } = await import('@/stores/charms');
        useCharmsStore.setState({
            charms,
            initialized: true,
            isLoading: false,
            currentNetwork: `${blockchain}-${network}`,
        });
    } catch (e) {
        console.warn('[ExtWalletSync] Charms store update failed:', e.message);
    }

    // Save balance
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
}

// ============================================
// Fallback path (mempool.space + prover)
// ============================================

async function runFallback(addressList, network, skipCharms, blockchain, onPhase1Complete, onCharmFound, onCharmProgress, result, _ts) {
    const { fallbackProvider } = await import('@/services/shared/fallback-provider');

    // Balance from mempool — this should always work
    const fbBalance = await fallbackProvider.getBalance(addressList, network);
    console.log(`[${_ts()}] [ExtWalletSync] Fallback balance: ${fbBalance.total} sats`);

    // Charms — may fail (prover down), degrade gracefully
    let fbCharms = { charms: [], tokenBalances: [], degraded: false };
    if (!skipCharms) {
        try {
            fbCharms = await fallbackProvider.getCharmBalances(addressList, network, {
                onProgress: onCharmProgress,
                onCharmFound,
            });
            if (fbCharms.degraded) {
                console.warn(`[${_ts()}] [ExtWalletSync] Prover unavailable — charm data degraded`);
            }
        } catch (charmErr) {
            console.warn(`[${_ts()}] [ExtWalletSync] Charm fallback failed: ${charmErr.message}`);
            fbCharms = { charms: [], tokenBalances: [], degraded: true };
        }
    }

    await applyResults(fbBalance, fbCharms.charms, fbCharms.tokenBalances, blockchain, network, onPhase1Complete, onCharmFound);

    result.totalBalance = fbBalance.total || 0;
    result.charmsFound = fbCharms.charms.length;
    result.success = true;
    return result;
}

// ============================================
// Main entry point
// ============================================

export async function syncWalletExtension(options = {}) {
    const {
        blockchain = BLOCKCHAINS.BITCOIN,
        network = NETWORKS.BITCOIN.MAINNET,
        fullScan = false,
        skipCharms = false,
        onCharmProgress = null,
        onCharmFound = null,
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
    console.log(`[${_ts()}] [ExtWalletSync] ▶ Sync started (network=${network}, fullScan=${fullScan})`);

    try {
        // ── Check Explorer API availability ──
        const { explorerWalletService } = await import('@/services/shared/explorer-wallet-service');
        const explorerAvailable = explorerWalletService.isAvailable(network);

        // ── Get wallet addresses ──
        const storedAddresses = await getAddresses(blockchain, network);
        const addressList = storedAddresses
            .filter(a => !a.blockchain || a.blockchain === blockchain)
            .map(a => a.address);

        console.log(`[${_ts()}] [ExtWalletSync] Explorer=${explorerAvailable}, addresses=${addressList.length}`);
        if (addressList.length > 0) console.log(`[${_ts()}] [ExtWalletSync] First address:`, addressList[0]);

        // ============================================
        // PRIMARY: Explorer API batch (2 POST calls)
        // ============================================
        if (explorerAvailable && addressList.length > 0) {
            try {
                const t0 = performance.now();

                const { balanceResult, charms, tokenBalances, utxoMap } =
                    await fetchFromExplorerAPI(explorerWalletService, addressList, network, skipCharms);

                const utxoCount = Object.values(utxoMap).reduce((s, list) => s + list.length, 0);
                const ms = (performance.now() - t0).toFixed(0);
                console.log(`[${_ts()}] [ExtWalletSync] ⚡ Explorer batch: ${ms}ms — balance=${balanceResult.total} sats, utxos=${utxoCount}, charms=${charms.length}`);
                if (tokenBalances.length > 0) console.log(`[${_ts()}] [ExtWalletSync] tokenBalances:`, JSON.stringify(tokenBalances));

                // Save UTXOs to storage (for spending capability)
                await saveUTXOs(utxoMap, blockchain, network);

                await applyResults(balanceResult, charms, tokenBalances, blockchain, network, onPhase1Complete, onCharmFound);

                result.totalBalance = balanceResult.total || 0;
                result.utxosUpdated = utxoCount;
                result.charmsFound = charms.length;

            } catch (err) {
                console.warn(`[${_ts()}] [ExtWalletSync] ⚡ Explorer batch failed: ${err.message}`);
                console.warn(`[${_ts()}] [ExtWalletSync] Activating fallback...`);
                return await runFallback(addressList, network, skipCharms, blockchain, onPhase1Complete, onCharmFound, onCharmProgress, result, _ts);
            }
        } else {
            console.log(`[${_ts()}] [ExtWalletSync] Explorer unavailable, using fallback...`);
            return await runFallback(addressList, network, skipCharms, blockchain, onPhase1Complete, onCharmFound, onCharmProgress, result, _ts);
        }

        console.log(`[${_ts()}] [ExtWalletSync] ■ Complete: balance=${result.totalBalance}, utxos=${result.utxosUpdated}, charms=${result.charmsFound}`);
        result.success = true;
        return result;

    } catch (error) {
        console.error('[ExtWalletSync] Error:', error);
        result.error = error.message;
        return result;
    }
}
