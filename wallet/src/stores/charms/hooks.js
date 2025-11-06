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
        getCharmDisplayName
    } = useCharmsStore();

    // Auto-initialize on mount or network change
    useEffect(() => {
        if (activeBlockchain && activeNetwork) {
            console.log(`🔄 [useCharms] Auto-initializing for ${activeBlockchain}/${activeNetwork}`);
            console.log(`   └─ Current charms in store: ${charms.length}`);
            console.log(`   └─ Initialized: ${initialized}`);
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
        getCharmDisplayName
    };
}
