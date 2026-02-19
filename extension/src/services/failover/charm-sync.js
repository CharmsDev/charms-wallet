/**
 * FAILOVER: Charm Sync
 * 
 * Synchronizes charms by scanning UTXOs and verifying each transaction
 * via the external prover API. This is the SLOW path (~10-30s).
 * 
 * PRIMARY replacement: Explorer API GET /v1/wallet/charms/{address}
 * This module is only used when the Explorer API is unavailable.
 * 
 * @see ../extension-wallet-sync.js for the primary flow
 * @see ./README.md for when this can be deleted
 */

import { extractCharmsFromUTXOs } from './charm-verifier';
import { saveCharms } from '@/services/storage';

/**
 * Synchronize charms for given UTXOs using the external verify API.
 * Drop-in replacement for the core syncCharms function.
 */
export async function failoverSyncCharms({ utxos, blockchain, network, onProgress, onCharmFound }) {
    const result = {
        charmsFound: 0,
        charmsRemoved: 0,
        success: false,
        error: null
    };

    try {
        // Start fresh every sync
        await saveCharms([], blockchain, network);

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
                    if (onCharmFound) await onCharmFound(charm);
                }
            },
            onProgress
        );

        // Enrich with reference data
        let enhancedCharms = newCharms;
        try {
            const { default: charmsExplorerAPI } = await import('@/services/charms/charms-explorer-api');
            enhancedCharms = await charmsExplorerAPI.processCharmsWithReferenceData(newCharms);
        } catch (e) {
            console.warn('[FailoverCharmSync] charmsExplorerAPI enrichment failed:', e.message);
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
            console.warn('[FailoverCharmSync] Store update failed:', e.message);
        }

        console.log(`[FailoverCharmSync] Complete: ${result.charmsFound} charms found`);
        result.success = true;
        return result;
    } catch (error) {
        console.error('[FailoverCharmSync] Error:', error);
        result.error = error.message;
        return result;
    }
}
