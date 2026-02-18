/**
 * Extension Charm Sync (Extension-only override)
 * 
 * Replaces the core wallet's charm-sync.js for the extension context.
 * Uses the external prover verify API (charm-verifier.js) instead of WASM.
 * 
 * This module mirrors the interface of wallet/src/services/wallet/sync/charm-sync.js
 * but swaps the extraction engine.
 */

import { extractCharmsFromUTXOs } from './charm-verifier';
import { saveCharms } from '@/services/storage';

/**
 * Synchronize charms for given UTXOs using the external verify API.
 * Drop-in replacement for the core syncCharms function.
 * 
 * @param {Object} options
 * @param {Object} options.utxos - UTXO map { address: [{ txid, vout, value }] }
 * @param {string} options.blockchain - e.g. 'bitcoin'
 * @param {string} options.network - e.g. 'testnet4'
 * @param {Function} options.onProgress - (current, total) callback
 * @param {Function} options.onCharmFound - async (charm) callback
 * @returns {Object} { charmsFound, charmsRemoved, success, error }
 */
export async function syncCharmsViaAPI({ utxos, blockchain, network, onProgress, onCharmFound }) {
    const result = {
        charmsFound: 0,
        charmsRemoved: 0,
        success: false,
        error: null
    };

    try {
        // ===== DIAGNOSTIC DUMP =====
        const allAddresses = Object.keys(utxos);
        const allUtxoCount = Object.values(utxos).reduce((sum, list) => sum + list.length, 0);
        const uniqueTxids = new Set();
        Object.values(utxos).forEach(list => list.forEach(u => uniqueTxids.add(u.txid)));
        console.log(`[ExtCharmSync] ===== DIAGNOSTIC DUMP =====`);
        console.log(`[ExtCharmSync] Addresses: ${allAddresses.length}`);
        allAddresses.forEach(addr => {
            const addrUtxos = utxos[addr];
            console.log(`[ExtCharmSync]   ${addr} → ${addrUtxos.length} UTXOs, txids: ${[...new Set(addrUtxos.map(u => u.txid.slice(0,8)))].join(',')}`);
        });
        console.log(`[ExtCharmSync] Total UTXOs: ${allUtxoCount}, Unique txids: ${uniqueTxids.size}`);
        console.log(`[ExtCharmSync] ===========================`);

        // Start fresh every sync — clear old cached charms to avoid stale/corrupt data.
        // The address ownership verification in charm-verifier ensures only
        // charms we actually own get counted.
        await saveCharms([], blockchain, network);

        // Scan all UTXOs and collect only verified charms
        const newCharms = [];
        const seenKeys = new Set();
        await extractCharmsFromUTXOs(
            utxos,
            network,
            async (charm) => {
                const key = `${charm.txid}:${charm.outputIndex}`;
                if (!seenKeys.has(key)) {
                    seenKeys.add(key);
                    newCharms.push(charm);
                    result.charmsFound++;
                    if (onCharmFound) {
                        await onCharmFound(charm);
                    }
                }
            },
            onProgress
        );

        const finalCharms = newCharms;

        // ===== DIAGNOSTIC: CHARMS FOUND =====
        const BRO_ID = 't/3d7fe7e4cea6121947af73d70e5119bebd8aa5b7edfe74bfaf6e779a1847bd9b/c975d4e0c292fb95efbda5c13312d6ac1d8b5aeff7f0f1e5578645a2da70ff5f';
        let broTotal = 0;
        console.log(`[ExtCharmSync] ===== CHARMS FOUND: ${finalCharms.length} =====`);
        finalCharms.forEach((c, i) => {
            const isBro = c.appId === BRO_ID;
            const amt = Number(c.displayAmount || (c.amount / Math.pow(10, c.decimals || 8))) || 0;
            if (isBro) broTotal += amt;
            console.log(`[ExtCharmSync]   [${i}] txid=${c.txid?.slice(0,8)}... vout=${c.outputIndex} appId=${c.appId?.slice(0,30)}... amount=${c.amount} display=${amt} addr=${c.address?.slice(0,16)}... ${isBro ? '<<< BRO' : ''}`);
        });
        console.log(`[ExtCharmSync] ===== BRO TOTAL (pre-enrichment): ${Number(broTotal).toFixed(8)} =====`);

        // Enrich with reference data (BRO metadata etc.)
        // We already do this in charm-verifier normalizeCharm, but run through
        // charmsExplorerAPI too for consistency with the rest of the wallet
        let enhancedCharms = finalCharms;
        try {
            const { default: charmsExplorerAPI } = await import('@/services/charms/charms-explorer-api');
            enhancedCharms = await charmsExplorerAPI.processCharmsWithReferenceData(finalCharms);
        } catch (e) {
            console.warn('[ExtCharmSync] charmsExplorerAPI enrichment failed, using raw charms:', e.message);
        }

        // Save to storage
        await saveCharms(enhancedCharms, blockchain, network);

        // Update Zustand store
        try {
            const { useCharmsStore } = await import('@/stores/charms');
            useCharmsStore.setState({
                charms: enhancedCharms,
                initialized: true,
                isLoading: false,
                currentNetwork: `${blockchain}-${network}`
            });
        } catch (e) {
            console.warn('[ExtCharmSync] Store update failed:', e.message);
        }

        console.log(`[ExtCharmSync] Sync complete: ${result.charmsFound} new, ${result.charmsRemoved} removed, ${enhancedCharms.length} total`);

        result.success = true;
        return result;
    } catch (error) {
        console.error('[ExtCharmSync] Error:', error);
        result.error = error.message;
        return result;
    }
}
