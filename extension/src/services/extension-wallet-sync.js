/**
 * Extension Wallet Sync Service (Extension-only override)
 * 
 * Mirrors wallet/src/services/wallet/sync/index.js but uses the
 * API-based charm sync instead of WASM-based.
 * 
 * Only the charm extraction is different — UTXO sync and balance
 * calculation use the same core wallet code.
 */

import { utxoService } from '@/services/utxo';
import { getCharms, saveBalance } from '@/services/storage';
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';
import { syncUTXOs } from '@/services/wallet/sync/utxo-sync';
import { syncCharmsViaAPI } from './extension-charm-sync';

/**
 * Sync wallet data (UTXOs + Charms via external API)
 */
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
        addressLimit = null
    } = options;

    const result = {
        success: false,
        utxosUpdated: 0,
        charmsFound: 0,
        charmsRemoved: 0,
        totalBalance: 0,
        error: null
    };

    try {
        // ============================================
        // PHASE 1: UPDATE UTXOs (same as core)
        // ============================================
        const { result: utxoResult, utxos: updatedUTXOs } = await syncUTXOs({
            addresses,
            blockchain,
            network,
            fullScan,
            onProgress: onUTXOProgress,
            updateUTXOStore,
            addressLimit
        });

        result.utxosUpdated = utxoResult.utxosUpdated;

        // ============================================
        // PHASE 2: UPDATE CHARMS via external API
        // ============================================
        if (!skipCharms && Object.keys(updatedUTXOs).length > 0) {
            const charmResult = await syncCharmsViaAPI({
                utxos: updatedUTXOs,
                blockchain,
                network,
                onProgress: onCharmProgress,
                onCharmFound
            });

            result.charmsFound = charmResult.charmsFound;
            result.charmsRemoved = charmResult.charmsRemoved;
        }

        // ============================================
        // PHASE 3: CALCULATE BALANCES (same as core)
        // ============================================
        const storedCharms = await getCharms(blockchain, network);
        const balanceData = utxoService.calculateBalances(updatedUTXOs, storedCharms);
        
        result.totalBalance = balanceData.spendable + balanceData.pending;

        // Calculate token balances
        let tokenBalances = [];
        if (storedCharms && storedCharms.length > 0) {
            const { useCharmsStore } = await import('@/stores/charms');
            const tokenGroups = useCharmsStore.getState().groupTokensByAppId();
            tokenBalances = tokenGroups.map(group => ({
                appId: group.appId,
                name: group.name,
                ticker: group.ticker,
                amount: group.totalAmount
            }));
        }

        // Save balance to storage
        await saveBalance(blockchain, network, {
            spendable: balanceData.spendable,
            pending: balanceData.pending,
            nonSpendable: balanceData.nonSpendable,
            utxoCount: result.utxosUpdated,
            charmCount: storedCharms?.length || 0,
            ordinalCount: 0,
            runeCount: 0,
            tokens: tokenBalances
        });

        // Update UTXO store in memory
        const { useUTXOStore } = await import('@/stores/utxoStore');
        useUTXOStore.setState({
            totalBalance: balanceData.spendable,
            pendingBalance: balanceData.pending
        });

        result.success = true;
        return result;

    } catch (error) {
        console.error('[ExtWalletSync] Error:', error);
        result.error = error.message;
        return result;
    }
}
