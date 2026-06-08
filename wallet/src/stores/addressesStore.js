'use client';

import { create } from 'zustand';
import { getAddresses, saveAddresses } from '@/services/storage';
import { generateTaprootAddress, generateInitialBitcoinAddresses } from '@/utils/addressUtils';
import { useBlockchain } from './blockchainStore';

const useAddressesStore = create((set, get) => ({
    addresses: [],
    loading: false,
    isGenerating: false,
    generationProgress: { current: 0, total: 0 },
    error: null,
    initialized: false,
    currentNetwork: null,

    // Simplified address loader — works for both Bitcoin and Cardano
    loadAddresses: async (blockchain, network) => {
        const networkKey = `${blockchain}-${network}`;

        // Check if network has changed - if so, clear existing addresses and reinitialize
        const state = get();
        if (state.currentNetwork && state.currentNetwork !== networkKey) {
            set({
                addresses: [],
                initialized: false,
                currentNetwork: networkKey,
                error: null
            });
        } else {
            set({ currentNetwork: networkKey });
        }

        const freshState = get();
        if (freshState.loading || freshState.initialized) return;

        set({ loading: true, error: null });

        try {
            let storedAddresses = await getAddresses(blockchain, network);

            // Cardano on-the-fly derivation requires a seed; G003 means
            // seed is in RAM only. cardanoStore.deriveAddresses (called by
            // CardanoDashboard with seedPhrase from walletStore) handles
            // first-time derivation. If nothing is in storage here, leave
            // the list empty and let that path populate it.

            await new Promise(resolve => setTimeout(resolve, 200));

            set({
                addresses: storedAddresses || [],
                loading: false,
                initialized: true
            });

        } catch (err) {
            console.error(`[ADDRESSES STORE] Error loading addresses for ${networkKey}:`, err);
            set({
                error: 'Failed to load addresses',
                loading: false,
                initialized: true
            });
        }
    },

    // Generate more addresses on demand. G003: seedPhrase must be passed
    // by the caller (lives in RAM via walletStore.seedPhrase, never in
    // storage). Signature: (seedPhrase, count = 5).
    generateMoreAddresses: async (seedPhrase, count = 5) => {
        const state = get();
        if (state.isGenerating) return;

        if (!seedPhrase) {
            throw new Error('Wallet locked. Please unlock and retry.');
        }

        set({ isGenerating: true });

        try {
            const { activeBlockchain, activeNetwork } = useBlockchain.getState();

            const currentAddresses = state.addresses;
            const maxIndex = Math.max(...currentAddresses.map(addr => addr.index), -1);
            const startIndex = maxIndex + 1;
            const newAddresses = [];

            if (activeBlockchain === 'cardano') {
                // Cardano: derive payment addresses (no change addresses in Cardano model)
                const { generateCardanoAddress } = await import('@/lib/cardano/wallet');
                for (let i = startIndex; i < startIndex + count; i++) {
                    const addr = await generateCardanoAddress(seedPhrase, i, activeNetwork);
                    newAddresses.push({
                        address: addr,
                        index: i,
                        isChange: false,
                        isStaking: false,
                        blockchain: activeBlockchain,
                        created: new Date().toISOString(),
                    });
                }
            } else {
                // Bitcoin: derive external + change Taproot pairs
                for (let i = startIndex; i < startIndex + count; i++) {
                    const [externalAddress, changeAddress] = await Promise.all([
                        generateTaprootAddress(seedPhrase, i, false),
                        generateTaprootAddress(seedPhrase, i, true)
                    ]);

                    newAddresses.push(
                        {
                            address: externalAddress,
                            index: i,
                            isChange: false,
                            created: new Date().toISOString(),
                            blockchain: activeBlockchain
                        },
                        {
                            address: changeAddress,
                            index: i,
                            isChange: true,
                            created: new Date().toISOString(),
                            blockchain: activeBlockchain
                        }
                    );
                }
            }

            const allAddresses = [...currentAddresses, ...newAddresses];
            await saveAddresses(allAddresses, activeBlockchain, activeNetwork);
            set({ addresses: allAddresses, isGenerating: false });

        } catch (err) {
            console.error('Error generating more addresses:', err);
            set({ error: 'Failed to generate more addresses', isGenerating: false });
        }
    },

    addAddress: async (address, blockchain, network) => {
        const currentAddresses = get().addresses;
        const addressWithBlockchain = { ...address, blockchain };
        const newAddresses = [...currentAddresses, addressWithBlockchain];
        await saveAddresses(newAddresses, blockchain, network);
        set({ addresses: newAddresses });
    },

    // Generate addresses in background (non-blocking)
    generateAllAddressesInBackground: async (seedPhrase, blockchain, network) => {
        const state = get();

        // Don't start if already generating or if we already have enough addresses (6 pairs = 12 addrs)
        if (state.isGenerating || state.addresses.length >= 12) {
            return;
        }

        // Use the existing function from addressUtils but adapt it for our store
        generateInitialBitcoinAddresses(
            seedPhrase,
            // Progress callback
            (current, total) => {
                set({
                    generationProgress: {
                        current: current * 2, // Each index generates 2 addresses (external + change)
                        total: total * 2
                    }
                });
            },
            // Complete callback
            async (generatedAddresses) => {
                try {
                    // Add blockchain info to each address
                    const addressesWithBlockchain = generatedAddresses.map(addr => ({
                        ...addr,
                        blockchain
                    }));

                    // Get current addresses and merge with new ones
                    const currentAddresses = get().addresses;
                    const allAddresses = [...currentAddresses, ...addressesWithBlockchain];

                    // Remove duplicates based on address string
                    const uniqueAddresses = allAddresses.filter((addr, index, self) =>
                        index === self.findIndex(a => a.address === addr.address)
                    );

                    // Save to storage
                    await saveAddresses(uniqueAddresses, blockchain, network);

                    // Update state
                    set({
                        addresses: uniqueAddresses,
                        generationProgress: { current: 0, total: 0 }
                    });

                } catch (error) {
                    console.error('Error saving background generated addresses:', error);
                    set({
                        error: 'Failed to save generated addresses',
                        generationProgress: { current: 0, total: 0 }
                    });
                }
            }
        );
    },

    clearAddresses: (blockchain, network) => {
        saveAddresses([], blockchain, network);
        set({ addresses: [] });
    },
}));

export const useAddresses = () => {
    const state = useAddressesStore();
    return state;
};
