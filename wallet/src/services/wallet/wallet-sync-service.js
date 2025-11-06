/**
 * Wallet Sync Service
 * 
 * Master service that coordinates UTXO and Charms synchronization.
 * Ensures data consistency by updating in the correct order:
 * 1. UTXOs first
 * 2. Charms second (based on updated UTXOs)
 */

import { utxoService } from '@/services/utxo';
import { charmsService } from '@/services/charms/charms';
import { refreshSpecificAddresses } from '@/services/utxo/address-refresh-helper';
import { getUTXOs, saveBalance, getCharms, saveCharms } from '@/services/storage';
import { BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';

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
        addressLimit = null  // null = scan all addresses
    } = options;

    const result = {
        success: false,
        utxosUpdated: 0,
        charmsFound: 0,
        totalBalance: 0,
        error: null
    };

    try {
        // ============================================
        // PHASE 1: UPDATE UTXOs
        // ============================================
        let updatedUTXOs = {};

        if (fullScan) {
            console.log(`[WalletSync] Full UTXO scan (${addressLimit} addresses)`);
            
            if (updateUTXOStore) {
                await updateUTXOStore(blockchain, network, addressLimit);
                updatedUTXOs = await getUTXOs(blockchain, network) || {};
            } else {
                await utxoService.fetchAndStoreAllUTXOsSequential(
                    blockchain,
                    network,
                    onUTXOProgress,
                    addressLimit,
                    0
                );
                updatedUTXOs = await getUTXOs(blockchain, network) || {};
            }
        } else if (addresses && addresses.length > 0) {
            console.log(`[WalletSync] Refreshing ${addresses.length} specific addresses`);
            updatedUTXOs = await refreshSpecificAddresses(addresses, blockchain, network);
            
            if (onUTXOProgress) {
                onUTXOProgress({
                    processed: addresses.length,
                    total: addresses.length,
                    isRefreshing: false
                });
            }
        } else {
            console.log(`[WalletSync] Loading existing UTXOs`);
            updatedUTXOs = await getUTXOs(blockchain, network) || {};
        }

        result.utxosUpdated = Object.values(updatedUTXOs).reduce(
            (sum, utxoList) => sum + utxoList.length, 0
        );
        
        // Calculate TOTAL balance (all UTXOs including protected ones)
        result.totalBalance = utxoService.calculateTotalBalance(updatedUTXOs);

        console.log(`[WalletSync] UTXOs: ${result.utxosUpdated}, Total Balance: ${result.totalBalance} sats`);

        // ============================================
        // PHASE 2: UPDATE CHARMS (if not skipped)
        // ============================================
        if (!skipCharms && Object.keys(updatedUTXOs).length > 0) {
            console.log(`[WalletSync] Starting charm scan with set difference logic`);
            
            // Get existing charms and scanned addresses
            const scannedAddresses = Object.keys(updatedUTXOs);
            const existingCharms = await getCharms(blockchain, network) || [];
            
            console.log(`\n🔮 [WalletSync] ===== CHARM SYNC DETAILS =====`);
            console.log(`📍 [WalletSync] Scanned addresses (${scannedAddresses.length}):`, 
                scannedAddresses.map(a => a.slice(0, 15) + '...'));
            console.log(`💎 [WalletSync] Existing charms (${existingCharms.length}):`, 
                existingCharms.map(c => `${c.txid.slice(0, 8)}:${c.outputIndex} @ ${c.address.slice(0, 10)}...`));
            
            // Create UTXO map for quick lookup: "address:txid:vout" -> exists
            const utxoExists = new Map();
            Object.entries(updatedUTXOs).forEach(([address, utxos]) => {
                console.log(`📦 [WalletSync] UTXOs for ${address.slice(0, 15)}... (${utxos.length}):`,
                    utxos.map(u => `${u.txid.slice(0, 8)}:${u.vout}`));
                utxos.forEach(utxo => {
                    const key = `${address}:${utxo.txid}:${utxo.vout}`;
                    utxoExists.set(key, true);
                });
            });
            
            // SET DIFFERENCE: Keep charms from non-scanned addresses + charms with valid UTXOs from scanned addresses
            console.log(`\n🔍 [WalletSync] ===== FILTERING EXISTING CHARMS =====`);
            const charmsToKeep = existingCharms.filter(charm => {
                // Keep charms from addresses we didn't scan
                if (!scannedAddresses.includes(charm.address)) {
                    console.log(`✅ [WalletSync] Keeping charm ${charm.txid.slice(0, 8)}:${charm.outputIndex} (address not scanned)`);
                    return true;
                }
                
                // For scanned addresses: only keep if UTXO still exists
                const key = `${charm.address}:${charm.txid}:${charm.outputIndex}`;
                const exists = utxoExists.has(key);
                
                if (exists) {
                    console.log(`✅ [WalletSync] Keeping charm ${charm.txid.slice(0, 8)}:${charm.outputIndex} (UTXO exists)`);
                } else {
                    console.log(`❌ [WalletSync] Removing charm ${charm.txid.slice(0, 8)}:${charm.outputIndex} (UTXO spent)`);
                }
                
                return exists;
            });
            
            const removedCount = existingCharms.length - charmsToKeep.length;
            if (removedCount > 0) {
                console.log(`[WalletSync] Removed ${removedCount} charms with spent UTXOs`);
            }
            
            // Create map of existing charms for quick lookup
            const existingCharmKeys = new Set(
                charmsToKeep.map(c => `${c.txid}:${c.outputIndex}`)
            );
            
            // Scan and add NEW charms that have valid UTXOs
            const newCharms = [];
            await charmsService.getCharmsByUTXOsProgressive(
                updatedUTXOs,
                network,
                async (charm) => {
                    const key = `${charm.txid}:${charm.outputIndex}`;
                    if (!existingCharmKeys.has(key)) {
                        // New charm found
                        newCharms.push(charm);
                        result.charmsFound++;
                        // DON'T call onCharmFound here - we'll add all at once after saving
                        console.log(`[WalletSync] New charm found: ${charm.txid}:${charm.outputIndex}`);
                    }
                    // If already exists, don't add again (already in charmsToKeep)
                },
                onCharmProgress
            );
            
            // Save final charm set: kept + new
            const finalCharms = [...charmsToKeep, ...newCharms];
            
            console.log(`\n💾 [WalletSync] Saving ${finalCharms.length} charms to localStorage...`);
            
            // Process charms with reference data before saving
            const { default: charmsExplorerAPI } = await import('@/services/charms/charms-explorer-api');
            const enhancedCharms = await charmsExplorerAPI.processCharmsWithReferenceData(finalCharms);
            
            // Save to localStorage (CORRECT ORDER: charms, blockchain, network)
            await saveCharms(enhancedCharms, blockchain, network);
            console.log(`✅ [WalletSync] Charms saved to localStorage successfully`);
            
            // Verify save
            const verifyCharms = await getCharms(blockchain, network);
            console.log(`🔍 [WalletSync] Verification - localStorage now has ${verifyCharms?.length || 0} charms`);
            console.log(`🔍 [WalletSync] Charms in localStorage:`, verifyCharms.map(c => `${c.txid?.slice(0,8)}:${c.outputIndex}`));
            
            // CRITICAL: Sync store with localStorage (atomic replacement)
            // This ensures removed charms are deleted from memory store
            console.log(`🔄 [WalletSync] Syncing store with localStorage (${enhancedCharms.length} charms)...`);
            
            const { useCharmsStore } = await import('@/stores/charms');
            
            // Atomic replacement: set all charms at once and mark as initialized
            useCharmsStore.setState({ 
                charms: enhancedCharms, 
                initialized: true,
                isLoading: false,
                currentNetwork: `${blockchain}-${network}`
            });
            
            const finalState = useCharmsStore.getState();
            console.log(`✅ [WalletSync] Store synced with localStorage`);
            console.log(`📊 [WalletSync] Store now has ${finalState.charms.length} charms in memory`);

            console.log(`\n📊 [WalletSync] ===== CHARM SYNC SUMMARY =====`);
            console.log(`💎 [WalletSync] Existing: ${existingCharms.length}`);
            console.log(`❌ [WalletSync] Removed: ${removedCount}`);
            console.log(`✨ [WalletSync] New: ${newCharms.length}`);
            console.log(`✅ [WalletSync] Final: ${finalCharms.length}`);
            console.log(`📋 [WalletSync] Final charms:`, 
                finalCharms.map(c => `${c.txid.slice(0, 8)}:${c.outputIndex}`));
        }

        // Calculate SPENDABLE balance (excluding protected UTXOs: charms, ordinals, runes, etc.)
        const storedCharms = await getCharms(blockchain, network);
        const balanceData = utxoService.calculateBalances(updatedUTXOs, storedCharms);
        
        console.log(`[WalletSync] Balance breakdown - Spendable: ${balanceData.spendable} sats, Pending: ${balanceData.pending} sats, Protected: ${balanceData.nonSpendable} sats`);

        // Calculate token balances (BRO, etc.) from charms
        let tokenBalances = [];
        if (storedCharms && storedCharms.length > 0) {
            const { useCharmsStore } = await import('@/stores/charms');
            const charmsState = useCharmsStore.getState();
            const tokenGroups = charmsState.groupTokensByAppId();
            
            tokenBalances = tokenGroups.map(group => ({
                appId: group.appId,
                ticker: group.ticker || 'Unknown',
                name: group.name || 'Unknown Token',
                amount: group.totalAmount,
                utxoCount: group.tokenUtxos.length
            }));
            
            console.log(`\n💰 [WalletSync] ===== TOKEN BALANCES =====`);
            tokenBalances.forEach(token => {
                console.log(`  ${token.ticker}: ${token.amount.toFixed(2)} (${token.utxoCount} UTXOs)`);
            });
            console.log(`💰 [WalletSync] Total token types: ${tokenBalances.length}`);
        }

        // Save UNIFIED balances to localStorage (single key: "balance")
        // Structure: { bitcoin: {...}, counts: {...}, tokens: [...] }
        saveBalance(blockchain, network, {
            spendable: balanceData.spendable,
            pending: balanceData.pending,
            nonSpendable: balanceData.nonSpendable,
            utxoCount: result.utxosUpdated,
            charmCount: storedCharms?.length || 0,
            ordinalCount: 0,
            runeCount: 0,
            tokens: tokenBalances
        });

        // Update UTXO store in memory with final Bitcoin balances
        const { useUTXOStore } = await import('@/stores/utxoStore');
        useUTXOStore.setState({
            totalBalance: balanceData.spendable,
            pendingBalance: balanceData.pending
        });
        
        console.log(`✅ [WalletSync] All balances saved to localStorage and updated in memory`);

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

    console.log(`[WalletSync] Post-transfer sync (${addressesToSync.size} addresses)`);

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
 * @param addressLimit - null = scan all addresses, number = limit to N addresses
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
