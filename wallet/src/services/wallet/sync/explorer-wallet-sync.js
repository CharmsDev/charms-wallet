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
 * Fetch balance + charms from the Explorer indexed API.
 * Returns { balanceResult, charms, tokenBalances, utxos } or throws on failure.
 */
async function fetchFromExplorerAPI(explorerService, addressList, network, skipCharms) {
    // Use batch endpoints (single POST per type) instead of N individual GETs
    const [utxos, charmBalances] = await Promise.all([
        explorerService.getAggregateUTXOsBatch(addressList, network),
        skipCharms ? [] : explorerService.getAggregateCharmBalancesBatch(addressList, network),
    ]);

    // Normalize charms first — needed for isCharmUtxo check below
    const charms = [];
    const seenKeys = new Set();
    if (!skipCharms && Array.isArray(charmBalances)) {
        for (const balance of charmBalances) {
            for (const utxo of (balance.utxos || [])) {
                const key = `${utxo.txid}:${utxo.vout}`;
                if (seenKeys.has(key)) continue;
                seenKeys.add(key);
                charms.push(toCharmObj(utxo, balance));
            }
        }
    }

    // Calculate BTC balance using existing spendability checks (same logic as calculateBalances)
    let confirmed = 0;
    let unconfirmed = 0;
    for (const utxo of utxos) {
        if (isPotentialCharm(utxo)) continue;      // ≤ 1000 sats — dust / charm outputs
        if (isCharmUtxo(utxo, charms)) continue;   // known charm-bearing UTXOs
        const sats = utxo.value || 0;
        if ((utxo.confirmations || 0) >= 1) {
            confirmed += sats;
        } else {
            unconfirmed += sats;
        }
    }
    const balanceResult = { confirmed, unconfirmed, total: confirmed + unconfirmed };

    // Build token balance summary
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

    // 3. Callbacks (may trigger React renders — non-fatal)
    try {
        if (onPhase1Complete) {
            onPhase1Complete({
                spendable: balanceResult.confirmed || 0,
                pending: balanceResult.unconfirmed || 0,
                utxosUpdated: 0,
            });
        }
        if (onCharmFound) {
            for (const charm of charms) {
                await onCharmFound(charm);
            }
        }
    } catch (e) {
        console.warn('[ExplorerWalletSync] Callback error:', e.message);
    }
}

// ============================================
// Fallback path (mempool.space + prover)
// ============================================

async function runFallback(addressList, network, skipCharms, blockchain, onPhase1Complete, onCharmFound, result, _ts) {
    const { fallbackProvider } = await import('@/services/shared/fallback-provider');

    const fbBalance = await fallbackProvider.getBalance(addressList, network);
    console.log(`[${_ts()}] [ExplorerWalletSync] Fallback balance: ${fbBalance.total} sats`);

    let fbCharms = { charms: [], tokenBalances: [], degraded: false };
    if (!skipCharms) {
        try {
            fbCharms = await fallbackProvider.getCharmBalances(addressList, network);
            if (fbCharms.degraded) {
                console.warn(`[${_ts()}] [ExplorerWalletSync] Prover unavailable — charm data degraded`);
            }
        } catch (charmErr) {
            console.warn(`[${_ts()}] [ExplorerWalletSync] Charm fallback failed: ${charmErr.message}`);
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
        // PRIMARY: Explorer indexed API (instant)
        // ============================================
        if (explorerAvailable && addressList.length > 0) {
            // Step 1: Fetch data from Explorer API
            let fetchedData = null;
            try {
                const t0 = performance.now();
                fetchedData = await fetchFromExplorerAPI(explorerWalletService, addressList, network, skipCharms);
                const ms = (performance.now() - t0).toFixed(0);
                console.log(`[${_ts()}] [ExplorerWalletSync] ⚡ Explorer API: ${ms}ms — balance=${fetchedData.balanceResult.total} sats, charms=${fetchedData.charms.length}`);
            } catch (err) {
                console.warn(`[${_ts()}] [ExplorerWalletSync] ⚡ Explorer API fetch failed: ${err.message} — activating fallback`);
                return await runFallback(addressList, network, skipCharms, blockchain, onPhase1Complete, onCharmFound, result, _ts);
            }

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

        } else if (!explorerAvailable) {
            console.log(`[${_ts()}] [ExplorerWalletSync] Explorer unavailable — using fallback`);
            return await runFallback(addressList, network, skipCharms, blockchain, onPhase1Complete, onCharmFound, result, _ts);
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
