'use client';

import { create } from 'zustand';
import { getAddresses, saveAddresses } from '@/services/storage';
import { generateTaprootAddress, generateInitialBitcoinAddresses } from '@/utils/addressUtils';

const useAddressesStore = create((set, get) => ({
    addresses: [],
    loading: false,
    isGenerating: false,
    generationProgress: { current: 0, total: 0 },
    error: null,
    initialized: false,

    // Load addresses with lazy generation
    loadAddresses: async (seedPhrase, blockchain, network) => {
        const state = get();

        // Prevent multiple simultaneous loads
        if (state.loading || state.isGenerating) {
            return;
        }

        // If already initialized for this blockchain/network, skip
        if (state.initialized && state.addresses.length > 0) {
            return;
        }

        set({ loading: true, error: null });

        try {
            const storedAddresses = await getAddresses(blockchain, network);

            if (storedAddresses.length > 0) {
                // Small delay to show loader for better UX
                await new Promise(resolve => setTimeout(resolve, 200));

                set({
                    addresses: storedAddresses,
                    loading: false,
                    initialized: true
                });
                return;
            }

            if (!seedPhrase) {
                set({ loading: false, initialized: true });
                return;
            }

            // Generate only initial addresses (first 10 pairs = 20 addresses)
            await get().generateInitialAddresses(seedPhrase, blockchain, network);

        } catch (err) {
            console.error('Error loading addresses:', err);
            set({
                error: 'Failed to load addresses',
                loading: false,
                isGenerating: false,
                initialized: true
            });
        }
    },

    // Generate initial addresses (non-blocking, smaller batch)
    generateInitialAddresses: async (seedPhrase, blockchain, network) => {
        set({
            isGenerating: true,
            loading: false,
            generationProgress: { current: 0, total: 20 }
        });

        try {
            const addresses = [];
            const batchSize = 5; // Generate 5 pairs at a time
            const totalPairs = 10; // Only generate first 10 pairs initially

            for (let batch = 0; batch < totalPairs; batch += batchSize) {
                const batchPromises = [];
                const batchEnd = Math.min(batch + batchSize, totalPairs);

                for (let i = batch; i < batchEnd; i++) {
                    // Generate external address
                    batchPromises.push(
                        generateTaprootAddress(seedPhrase, i, false).then(address => ({
                            address,
                            index: i,
                            isChange: false,
                            created: new Date().toISOString(),
                            blockchain
                        }))
                    );

                    // Generate change address
                    batchPromises.push(
                        generateTaprootAddress(seedPhrase, i, true).then(address => ({
                            address,
                            index: i,
                            isChange: true,
                            created: new Date().toISOString(),
                            blockchain
                        }))
                    );
                }

                const batchResults = await Promise.all(batchPromises);
                addresses.push(...batchResults);

                // Update progress
                set({
                    generationProgress: {
                        current: addresses.length,
                        total: totalPairs * 2
                    }
                });

                // Small delay to prevent UI blocking
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            await saveAddresses(addresses, blockchain, network);

            set({
                addresses,
                isGenerating: false,
                generationProgress: { current: 0, total: 0 },
                initialized: true
            });

        } catch (err) {
            console.error('Error generating addresses:', err);
            set({
                error: 'Failed to generate addresses',
                isGenerating: false,
                generationProgress: { current: 0, total: 0 },
                initialized: true
            });
        }
    },

    // Generate more addresses on demand
    generateMoreAddresses: async (seedPhrase, blockchain, network, count = 10) => {
        const state = get();
        if (state.isGenerating) return;

        set({ isGenerating: true });

        try {
            const currentAddresses = state.addresses;
            const maxIndex = Math.max(...currentAddresses.map(addr => addr.index), -1);
            const startIndex = maxIndex + 1;
            const newAddresses = [];

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
                        blockchain
                    },
                    {
                        address: changeAddress,
                        index: i,
                        isChange: true,
                        created: new Date().toISOString(),
                        blockchain
                    }
                );
            }

            const allAddresses = [...currentAddresses, ...newAddresses];
            await saveAddresses(allAddresses, blockchain, network);
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

    // Generate all 512 addresses in background (non-blocking)
    generateAllAddressesInBackground: async (seedPhrase, blockchain, network) => {
        const state = get();

        // Don't start if already generating or if we already have many addresses
        if (state.isGenerating || state.addresses.length >= 500) {
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
