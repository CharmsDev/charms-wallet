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
    loadWalletInfo: async (seedPhrase, blockchain, network) => {
        const state = get();

        // Prevent multiple simultaneous loads
        if (state.derivationLoading || state.initialized) {
            return;
        }

        set({ derivationLoading: true, error: null });

        try {
            let info = await getWalletInfo(blockchain, network);

            if (!info) {
                info = await deriveXpubFromSeedPhrase(seedPhrase);
                await saveWalletInfo(info, blockchain, network);
            }

            set({
                walletInfo: info,
                derivationLoading: false,
                initialized: true
            });

        } catch (err) {
            console.error("Failed to load wallet info:", err);
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
