/**
 * Charms Store Hooks
 * Compatibility layer for components using old charmsStore API
 */

import { useCharmsStore } from './index';
import { useBlockchain } from '../blockchainStore';
import { useEffect } from 'react';

/**
 * Hook that mimics old charmsStore API
 * Provides backward compatibility
 */
export function useCharms() {
    const { activeBlockchain, activeNetwork } = useBlockchain();
    
    const {
        charms,
        pendingCharms,
        isLoading,
        error,
        initialized,
        initialize,
        addCharm,
        removeCharm,
        addPendingCharm,
        removePendingCharm,
        clearOldPendingCharms,
        getTotalByAppId,
        getPendingByAppId,
        groupTokensByAppId,
        getNFTs,
        isCharmNFT,
        isCharmToken,
        getCharmDisplayName
    } = useCharmsStore();

    // Auto-initialize on mount or network change
    useEffect(() => {
        if (activeBlockchain && activeNetwork) {
            initialize(activeBlockchain, activeNetwork);
        }
    }, [activeBlockchain, activeNetwork]);

    // Auto-cleanup old pending charms (every 2 minutes)
    useEffect(() => {
        const interval = setInterval(() => {
            clearOldPendingCharms();
        }, 2 * 60 * 1000); // 2 minutes

        return () => clearInterval(interval);
    }, [clearOldPendingCharms]);

    return {
        charms,
        pendingCharms,
        isLoading,
        error,
        initialized,
        updateAfterTransfer: removeCharm,
        addPendingCharm,
        removePendingCharm,
        clearOldPendingCharms,
        getTotalByAppId,
        getPendingByAppId,
        groupTokensByAppId,
        getNFTs,
        isCharmNFT,
        isCharmToken,
        getCharmDisplayName
    };
}
