/**
 * Charms Store Hooks
 *
 * Thin compatibility layer around `useCharmsStore`. Auto-initialises
 * the local charm cache when the active (blockchain, network) changes.
 *
 * Pending charm bookkeeping lives in `@/services/balance`
 * (BalanceService) — this module no longer surfaces `pendingCharms`,
 * `addPendingCharm`, `getPendingByAppId` or `clearOldPendingCharms`.
 */

import { useCharmsStore } from './index';
import { useBlockchain } from '../blockchainStore';
import { useEffect } from 'react';

export function useCharms() {
    const { activeBlockchain, activeNetwork } = useBlockchain();

    const {
        charms,
        isLoading,
        error,
        initialized,
        initialize,
        addCharm,
        removeCharm,
        getTotalByAppId,
        groupTokensByAppId,
        getNFTs,
        isCharmNFT,
        isCharmToken,
        getCharmDisplayName,
    } = useCharmsStore();

    useEffect(() => {
        if (activeBlockchain && activeNetwork) {
            initialize(activeBlockchain, activeNetwork);
        }
    }, [activeBlockchain, activeNetwork]);

    return {
        charms,
        isLoading,
        error,
        initialized,
        updateAfterTransfer: removeCharm,
        getTotalByAppId,
        groupTokensByAppId,
        getNFTs,
        isCharmNFT,
        isCharmToken,
        getCharmDisplayName,
    };
}
