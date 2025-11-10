/**
 * Wallet Sync Service
 * 
 * Master orchestrator that coordinates UTXO and Charms synchronization.
 * Ensures data consistency by updating in the correct order:
 * 1. UTXOs first
 * 2. Charms second (based on updated UTXOs)
 * 3. Balance calculation
 */

import { utxoService } from '@/services/utxo';
import { getCharms, saveBalance } from '@/services/storage';
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';
import { syncUTXOs } from './utxo-sync';
import { syncCharms } from './charm-sync';

/**
 * Sync wallet data (UTXOs and Charms)
 */
export async function syncWallet(options = {}) {
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
        // PHASE 1: UPDATE UTXOs
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
        // PHASE 2: UPDATE CHARMS (if not skipped)
        // ============================================
        if (!skipCharms && Object.keys(updatedUTXOs).length > 0) {
            const charmResult = await syncCharms({
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
        // PHASE 3: CALCULATE BALANCES (with proper filtering)
        // ============================================
        const storedCharms = await getCharms(blockchain, network);
        // CRITICAL: calculateBalances filters out charms, ordinals, runes, and locked UTXOs - DO NOT bypass this filtering
        const balanceData = utxoService.calculateBalances(updatedUTXOs, storedCharms);
        
        // CRITICAL: Total balance MUST only include spendable + pending (never include reserved UTXOs)
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

        // Save balance to localStorage
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
        console.error('[WalletSync] Error:', error);
        result.error = error.message;
        return result;
    }
}

/**
 * Sync after charm transfer
 */
export async function syncAfterTransfer(transferData, blockchain, network, onCharmFound) {
    const { inputAddresses = [], changeAddress, fundingAddress } = transferData;

    const addressesToSync = new Set();
    inputAddresses.forEach(addr => { if (addr) addressesToSync.add(addr); });
    if (changeAddress) addressesToSync.add(changeAddress);
    if (fundingAddress) addressesToSync.add(fundingAddress);

    return await syncWallet({
        addresses: Array.from(addressesToSync),
        blockchain,
        network,
        fullScan: false,
        skipCharms: false,
        onCharmFound
    });
}

/**
 * UTXO-only sync (for UTXO tab)
 */
export async function syncUTXOsOnly(blockchain, network, updateUTXOStore, addressLimit = null) {
    return await syncWallet({
        blockchain,
        network,
        fullScan: true,
        skipCharms: true,
        updateUTXOStore,
        addressLimit
    });
}
