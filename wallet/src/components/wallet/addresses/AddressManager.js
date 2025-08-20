'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAddresses } from '@/stores/addressesStore';
import { useWallet } from '@/stores/walletStore';
import { useBlockchain } from '@/stores/blockchainStore';
import { useUTXOs } from '@/stores/utxoStore';
import { generateTaprootAddress, derivePrivateKey, organizeAddresses } from '@/utils/addressUtils';
import { generateCardanoAddressFromSeed, deriveCardanoPrivateKeyFromSeed, organizeCardanoAddresses } from '@/utils/cardanoAddressUtils';

// Import components
import AddressControls from './components/AddressControls';
import AddressList from './components/AddressList';

export default function AddressManager() {
    const {
        addresses,
        addAddress,
        generateMoreAddresses,
        isGenerating,
        generationProgress,
        loadAddresses,
        loading
    } = useAddresses();
    const { seedPhrase } = useWallet();
    const { activeBlockchain, activeNetwork, isBitcoin, isCardano } = useBlockchain();
    const { utxos } = useUTXOs();

    const [filter, setFilter] = useState('all'); // 'all' or 'in-use'
    const [visibleCount, setVisibleCount] = useState(16);
    const [addressError, setAddressError] = useState('');
    const [privateKeys, setPrivateKeys] = useState({});
    const [addressType, setAddressType] = useState('payment'); // 'payment' or 'staking' for Cardano

    // Load addresses when component mounts
    useEffect(() => {
        if (seedPhrase && activeBlockchain && activeNetwork) {
            loadAddresses(activeBlockchain, activeNetwork);
        }
    }, [seedPhrase, activeBlockchain, activeNetwork, loadAddresses]);

    // Generate new address based on active blockchain
    const generateNewAddress = async () => {
        try {
            setAddressError('');
            if (!seedPhrase) {
                setAddressError('No wallet found');
                return;
            }

            if (isBitcoin()) {
                // Use the optimized store function for Bitcoin
                await generateMoreAddresses(seedPhrase, activeBlockchain, activeNetwork, 5);
            } else if (isCardano()) {
                await generateCardanoAddress();
            }
        } catch (error) {
            setAddressError('Failed to generate addresses: ' + error.message);
        }
    };

    // Generate Cardano address (payment or staking)
    const generateCardanoAddress = async () => {
        // Calculate next index
        const isStaking = addressType === 'staking';
        const filteredAddresses = addresses.filter(addr =>
            addr.index >= 0 && addr.isStaking === isStaking
        );
        const nextIndex = filteredAddresses.length;

        // Generate address
        const newAddress = await generateCardanoAddressFromSeed(seedPhrase, nextIndex, isStaking);

        // Store address
        await addAddress({
            address: newAddress,
            index: nextIndex,
            isStaking,
            created: new Date().toISOString()
        });
    };

    // Toggle address type for Cardano
    const toggleAddressType = () => {
        setAddressType(addressType === 'payment' ? 'staking' : 'payment');
    };

    // Derive private keys for addresses
    const deriveAllPrivateKeys = async () => {
        try {
            if (!seedPhrase) {
                setAddressError('No wallet found');
                return;
            }

            const keys = {};
            for (const addr of addresses) {
                if (addr.index >= 0) { // Only derive for HD addresses, not imported ones
                    let privKey;

                    if (isBitcoin()) {
                        privKey = await derivePrivateKey(seedPhrase, addr.index, addr.isChange);
                    } else if (isCardano()) {
                        privKey = await deriveCardanoPrivateKeyFromSeed(seedPhrase, addr.index, addr.isStaking);
                    }

                    keys[addr.address] = privKey;
                }
            }
            setPrivateKeys(keys);
        } catch (error) {
            setAddressError('Failed to derive private keys: ' + error.message);
        }
    };

    // Derive private keys on-demand for specific addresses
    const derivePrivateKeysForAddresses = async (externalAddr, changeAddr) => {
        try {
            if (!seedPhrase) {
                setAddressError('No wallet found');
                return;
            }

            const newKeys = { ...privateKeys };

            // Derive external address private key
            if (externalAddr && externalAddr.index >= 0) {
                let privKey;
                if (isBitcoin()) {
                    privKey = await derivePrivateKey(seedPhrase, externalAddr.index, externalAddr.isChange);
                } else if (isCardano()) {
                    privKey = await deriveCardanoPrivateKeyFromSeed(seedPhrase, externalAddr.index, externalAddr.isStaking);
                }
                newKeys[externalAddr.address] = privKey;
            }

            // Derive change address private key
            if (changeAddr && changeAddr.index >= 0) {
                let privKey;
                if (isBitcoin()) {
                    privKey = await derivePrivateKey(seedPhrase, changeAddr.index, changeAddr.isChange);
                } else if (isCardano()) {
                    privKey = await deriveCardanoPrivateKeyFromSeed(seedPhrase, changeAddr.index, changeAddr.isStaking);
                }
                newKeys[changeAddr.address] = privKey;
            }

            setPrivateKeys(newKeys);
        } catch (error) {
            setAddressError('Failed to derive private keys: ' + error.message);
        }
    };

    const filteredAddresses = useMemo(() => {
        if (filter === 'in-use') {
            // For "in-use" filter, only show address pairs where at least one address has UTXOs
            const { addressPairs } = organizeAddresses(addresses);
            const filteredPairs = [];

            Object.entries(addressPairs).forEach(([index, addrGroup]) => {
                const externalAddr = addrGroup.find(a => !a.isChange);
                const changeAddr = addrGroup.find(a => a.isChange);

                const externalInUse = externalAddr && utxos && utxos[externalAddr.address] && utxos[externalAddr.address].length > 0;
                const changeInUse = changeAddr && utxos && utxos[changeAddr.address] && utxos[changeAddr.address].length > 0;

                // Include this pair if either address is in use
                if (externalInUse || changeInUse) {
                    filteredPairs.push(...addrGroup);
                }
            });

            return filteredPairs;
        }
        return addresses;
    }, [addresses, filter, utxos]);

    const visibleAddresses = useMemo(() => {
        return filteredAddresses.slice(0, visibleCount);
    }, [filteredAddresses, visibleCount]);

    const handleShowMore = () => {
        setVisibleCount(prevCount => prevCount + 8);
    };

    const canGenerateMore = filteredAddresses.length <= visibleCount && !loading;

    return (
        <div>
            {/* Title and controls - always visible */}
            <AddressControls
                onGenerateAddress={generateNewAddress}
                error={addressError}
                isCardano={isCardano()}
                addressType={addressType}
                onToggleAddressType={toggleAddressType}
                filter={filter}
                onFilterChange={setFilter}
                canGenerateMore={canGenerateMore}
                isGenerating={isGenerating}
                generationProgress={generationProgress}
            />

            {addressError && (
                <p className="px-6 mb-3 text-sm text-red-600">{addressError}</p>
            )}

            {/* Main address container */}
            <div className="card mb-6">
                {loading ? (
                    <div className="p-8 text-center">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-400 mb-4"></div>
                        <p className="text-gray-400">Loading addresses...</p>
                    </div>
                ) : (
                    <>
                        <AddressList
                            addresses={visibleAddresses}
                            privateKeys={privateKeys}
                            isCardano={isCardano()}
                            onDerivePrivateKey={derivePrivateKeysForAddresses}
                            utxos={utxos}
                            filter={filter}
                        />
                        <div className="p-4 text-center">
                            <p className="text-sm text-gray-400 mb-3">
                                Showing {visibleAddresses.length} of {filteredAddresses.length} addresses
                            </p>
                            {filteredAddresses.length > visibleCount && (
                                <button onClick={handleShowMore} className="btn btn-secondary">
                                    Show More
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
