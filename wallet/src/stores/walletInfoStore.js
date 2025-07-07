'use client';

import { create } from 'zustand';
import { getWalletInfo, saveWalletInfo } from '@/services/storage';
import { deriveXpubFromSeedPhrase } from '@/utils/descriptorUtils';

const useWalletInfoStore = create((set, get) => ({
    walletInfo: {
        xpub: '',
        xpriv: '',
        fingerprint: '',
        path: '86h/0h/0h',
    },
    derivationLoading: false,
    error: null,
    initialized: false,

    // Load wallet info from storage or derive it if not available
    loadWalletInfo: async (seedPhrase) => {
        console.log('🔑 [WALLET_INFO] loadWalletInfo called');
        const startTime = performance.now();
        const state = get();

        console.log('📊 [WALLET_INFO] Current state', {
            derivationLoading: state.derivationLoading,
            initialized: state.initialized,
            hasWalletInfo: !!state.walletInfo.xpub
        });

        // Prevent multiple simultaneous loads
        if (state.derivationLoading || state.initialized) {
            console.log('⏸️ [WALLET_INFO] Already loading or initialized, skipping');
            return;
        }

        console.log('🔄 [WALLET_INFO] Starting wallet info load...');
        set({ derivationLoading: true, error: null });

        try {
            console.log('💾 [WALLET_INFO] Checking storage for existing wallet info...');
            const storageStartTime = performance.now();
            let info = await getWalletInfo();
            console.log(`💾 [WALLET_INFO] Storage check completed in ${(performance.now() - storageStartTime).toFixed(2)}ms, found: ${!!info}`);

            if (!info) {
                console.log("🔧 [WALLET_INFO] No stored info found, deriving from seed phrase...");
                const derivationStartTime = performance.now();
                info = await deriveXpubFromSeedPhrase(seedPhrase);
                console.log(`🔧 [WALLET_INFO] Derivation completed in ${(performance.now() - derivationStartTime).toFixed(2)}ms`);

                console.log('💾 [WALLET_INFO] Saving derived wallet info...');
                const saveStartTime = performance.now();
                await saveWalletInfo(info);
                console.log(`💾 [WALLET_INFO] Save completed in ${(performance.now() - saveStartTime).toFixed(2)}ms`);
            } else {
                console.log('✅ [WALLET_INFO] Using stored wallet info');
            }

            set({
                walletInfo: info,
                derivationLoading: false,
                initialized: true
            });

            console.log(`🏁 [WALLET_INFO] loadWalletInfo completed in ${(performance.now() - startTime).toFixed(2)}ms`);
        } catch (err) {
            console.error("❌ [WALLET_INFO] Failed to load wallet info:", err);
            set({
                error: 'Failed to load wallet info: ' + err.message,
                derivationLoading: false,
                initialized: true
            });
        }
    },

    // Clear wallet info from state and storage
    clearWalletInfo: () => {
        set({
            walletInfo: {
                xpub: '',
                xpriv: '',
                fingerprint: '',
                path: '86h/0h/0h',
            },
            derivationLoading: false,
            error: null,
            initialized: false
        });
    }
}));

export const useWalletInfo = () => {
    const state = useWalletInfoStore();
    return state;
};
