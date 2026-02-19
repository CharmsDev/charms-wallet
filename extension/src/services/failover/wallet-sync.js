/**
 * FAILOVER: Wallet Sync
 * 
 * Full wallet sync using UTXO-by-UTXO scanning + prover verify for charms.
 * Used only when the Explorer indexed API is unavailable.
 * 
 * PRIMARY replacement: extension-wallet-sync.js (Explorer API fast path)
 * 
 * @see ../extension-wallet-sync.js for the primary flow
 * @see ./README.md for when this can be deleted
 */

import { utxoService } from '@/services/utxo';
import { getCharms, saveBalance } from '@/services/storage';
import { syncUTXOs } from '@/services/wallet/sync/utxo-sync';
import { failoverSyncCharms } from './charm-sync';

/**
 * Run the full failover sync: UTXO scan → balance calculation → charm extraction via prover.
 * Returns the same result shape as the primary syncWalletExtension.
 */
export async function failoverSync({
    addresses,
    blockchain,
    network,
    fullScan,
    skipCharms,
    onUTXOProgress,
    onCharmProgress,
    onCharmFound,
    updateUTXOStore,
    addressLimit,
    onPhase1Complete,
}) {
    const result = {
        success: false,
        utxosUpdated: 0,
        charmsFound: 0,
        charmsRemoved: 0,
        totalBalance: 0,
        error: null,
    };

    const _ts = () => new Date().toISOString().slice(11, 23);

    // ── Phase 1: UTXO scan ──
    console.log(`[${_ts()}] [FailoverSync] Phase 1: UTXO sync starting...`);
    const { result: utxoResult, utxos: updatedUTXOs } = await syncUTXOs({
        addresses,
        blockchain,
        network,
        fullScan,
        onProgress: onUTXOProgress,
        updateUTXOStore,
        addressLimit,
    });
    console.log(`[${_ts()}] [FailoverSync] Phase 1 done: ${utxoResult.utxosUpdated} UTXOs`);
    result.utxosUpdated = utxoResult.utxosUpdated;

    // ── Intermediate balance (BTC ready) ──
    const interimCharms = await getCharms(blockchain, network) || [];
    const interimBalance = utxoService.calculateBalances(updatedUTXOs, interimCharms);

    const { useUTXOStore } = await import('@/stores/utxoStore');
    useUTXOStore.setState({
        totalBalance: interimBalance.spendable,
        pendingBalance: interimBalance.pending,
    });

    if (onPhase1Complete) {
        onPhase1Complete({
            spendable: interimBalance.spendable,
            pending: interimBalance.pending,
            utxosUpdated: utxoResult.utxosUpdated,
        });
    }

    // ── Phase 2: Charm sync via prover ──
    if (!skipCharms && Object.keys(updatedUTXOs).length > 0) {
        console.log(`[${_ts()}] [FailoverSync] Phase 2: Charm sync via prover...`);
        const charmResult = await failoverSyncCharms({
            utxos: updatedUTXOs,
            blockchain,
            network,
            onProgress: onCharmProgress,
            onCharmFound,
        });
        result.charmsFound = charmResult.charmsFound;
        result.charmsRemoved = charmResult.charmsRemoved;
        console.log(`[${_ts()}] [FailoverSync] Phase 2 done: ${result.charmsFound} charms`);
    }

    // ── Phase 3: Final balance ──
    const storedCharms = await getCharms(blockchain, network);
    const balanceData = utxoService.calculateBalances(updatedUTXOs, storedCharms);
    result.totalBalance = balanceData.spendable + balanceData.pending;

    let tokenBalances = [];
    if (storedCharms && storedCharms.length > 0) {
        const { useCharmsStore } = await import('@/stores/charms');
        const tokenGroups = useCharmsStore.getState().groupTokensByAppId();
        tokenBalances = tokenGroups.map(group => ({
            appId: group.appId,
            name: group.name,
            ticker: group.ticker,
            amount: group.totalAmount,
        }));
    }

    await saveBalance(blockchain, network, {
        spendable: balanceData.spendable,
        pending: balanceData.pending,
        nonSpendable: balanceData.nonSpendable,
        utxoCount: result.utxosUpdated,
        charmCount: storedCharms?.length || 0,
        ordinalCount: 0,
        runeCount: 0,
        tokens: tokenBalances,
    });

    useUTXOStore.setState({
        totalBalance: balanceData.spendable,
        pendingBalance: balanceData.pending,
    });

    console.log(`[${_ts()}] [FailoverSync] ■ Complete: balance=${result.totalBalance}, utxos=${result.utxosUpdated}, charms=${result.charmsFound}`);
    result.success = true;
    return result;
}
