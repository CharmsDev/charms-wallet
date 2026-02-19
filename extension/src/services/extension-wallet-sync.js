/**
 * Extension Wallet Sync Service
 * 
 * PRIMARY FLOW: Charms Explorer indexed API
 *   - GET /v1/wallet/balance/{address}  → instant BTC balance
 *   - GET /v1/wallet/charms/{address}   → instant charm/token balances
 *   - UTXO sync runs after for spending capability
 * 
 * FAILOVER: If Explorer API is unavailable → failover/legacy-wallet-sync.js
 *   - UTXO scan address-by-address + prover verify for charms
 *   - See failover/README.md for details
 */

import { getAddresses, saveCharms, saveBalance } from '@/services/storage';
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';
import { syncUTXOs } from '@/services/wallet/sync/utxo-sync';

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
 * Fetch balance + charms from the Explorer indexed API.
 * Returns { balanceResult, charms, tokenBalances } or throws on failure.
 */
async function fetchFromExplorerAPI(explorerService, addressList, network, skipCharms) {
    const [balanceResult, charmBalances] = await Promise.all([
        explorerService.getAggregateBalance(addressList, network),
        skipCharms ? [] : explorerService.getAggregateCharmBalances(addressList, network),
    ]);

    // Normalize charms
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

    // Build token balance summary
    const tokenBalances = (Array.isArray(charmBalances) ? charmBalances : []).map(b => ({
        appId: b.appId,
        name: KNOWN_TOKENS[b.appId]?.name || b.symbol || 'Unknown',
        ticker: KNOWN_TOKENS[b.appId]?.ticker || b.symbol || 'TOKEN',
        amount: b.total || 0,
    }));

    return { balanceResult, charms, tokenBalances };
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
// Main entry point
// ============================================

export async function syncWalletExtension(options = {}) {
    const {
        addresses = null,
        blockchain = BLOCKCHAINS.BITCOIN,
        network = NETWORKS.BITCOIN.MAINNET,
        fullScan = false,
        skipCharms = false,
        onUTXOProgress = null,
        onCharmProgress = null,
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

        // ============================================
        // PRIMARY: Explorer indexed API (instant)
        // ============================================
        if (explorerAvailable && addressList.length > 0) {
            try {
                const t0 = performance.now();

                const { balanceResult, charms, tokenBalances } =
                    await fetchFromExplorerAPI(explorerWalletService, addressList, network, skipCharms);

                const ms = (performance.now() - t0).toFixed(0);
                console.log(`[${_ts()}] [ExtWalletSync] ⚡ Explorer API: ${ms}ms — balance=${balanceResult.total} sats, charms=${charms.length}`);

                await applyResults(balanceResult, charms, tokenBalances, blockchain, network, onPhase1Complete, onCharmFound);

                result.totalBalance = balanceResult.total || 0;
                result.charmsFound = charms.length;

            } catch (err) {
                console.warn(`[${_ts()}] [ExtWalletSync] ⚡ Explorer API failed: ${err.message}`);
                console.warn(`[${_ts()}] [ExtWalletSync] Activating failover...`);

                // ── FAILOVER ──
                const { failoverSync } = await import('./failover/wallet-sync');
                const legacyResult = await failoverSync({
                    addresses, blockchain, network, fullScan, skipCharms,
                    onUTXOProgress, onCharmProgress, onCharmFound,
                    updateUTXOStore, addressLimit, onPhase1Complete,
                });

                result.utxosUpdated = legacyResult.utxosUpdated;
                result.charmsFound = legacyResult.charmsFound;
                result.charmsRemoved = legacyResult.charmsRemoved;
                result.totalBalance = legacyResult.totalBalance;
                result.success = legacyResult.success;
                return result;
            }
        } else {
            // Explorer not available at all — go straight to failover
            console.log(`[${_ts()}] [ExtWalletSync] Explorer unavailable, using failover...`);

            const { failoverSync } = await import('./failover/wallet-sync');
            const legacyResult = await failoverSync({
                addresses, blockchain, network, fullScan, skipCharms,
                onUTXOProgress, onCharmProgress, onCharmFound,
                updateUTXOStore, addressLimit, onPhase1Complete,
            });

            result.utxosUpdated = legacyResult.utxosUpdated;
            result.charmsFound = legacyResult.charmsFound;
            result.charmsRemoved = legacyResult.charmsRemoved;
            result.totalBalance = legacyResult.totalBalance;
            result.success = legacyResult.success;
            return result;
        }

        // ============================================
        // UTXO sync (needed for spending, runs after display is ready)
        // ============================================
        console.log(`[${_ts()}] [ExtWalletSync] UTXO sync starting...`);
        const { result: utxoResult } = await syncUTXOs({
            addresses, blockchain, network, fullScan,
            onProgress: onUTXOProgress,
            updateUTXOStore, addressLimit,
        });
        result.utxosUpdated = utxoResult.utxosUpdated;
        console.log(`[${_ts()}] [ExtWalletSync] UTXO sync done: ${result.utxosUpdated} UTXOs`);

        console.log(`[${_ts()}] [ExtWalletSync] ■ Complete: balance=${result.totalBalance}, utxos=${result.utxosUpdated}, charms=${result.charmsFound}`);
        result.success = true;
        return result;

    } catch (error) {
        console.error('[ExtWalletSync] Error:', error);
        result.error = error.message;
        return result;
    }
}
