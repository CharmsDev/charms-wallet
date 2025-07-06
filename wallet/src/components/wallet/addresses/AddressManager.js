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
    const { addresses, addAddress } = useAddresses();
    const { seedPhrase } = useWallet();
    const { activeBlockchain, isBitcoin, isCardano } = useBlockchain();
    const { utxos } = useUTXOs();

    const [filter, setFilter] = useState('all'); // 'all' or 'in-use'
    const [visibleCount, setVisibleCount] = useState(16);
    const [addressError, setAddressError] = useState('');
    const [privateKeys, setPrivateKeys] = useState({});
    const [addressType, setAddressType] = useState('payment'); // 'payment' or 'staking' for Cardano

    // Generate new address based on active blockchain
    const generateNewAddress = async () => {
        try {
            setAddressError('');
            if (!seedPhrase) {
                setAddressError('No wallet found');
                return;
            }

            if (isBitcoin()) {
                await generateBitcoinAddress();
            } else if (isCardano()) {
                await generateCardanoAddress();
            }
        } catch (error) {
            setAddressError('Failed to generate addresses: ' + error.message);
        }
    };

    // Generate Bitcoin addresses (external and change)
    const generateBitcoinAddress = async () => {
        // Calculate next indices
        const externalAddresses = addresses.filter(addr => addr.index >= 0 && !addr.isChange);
        const nextExternalIndex = externalAddresses.length;
        const changeAddresses = addresses.filter(addr => addr.index >= 0 && addr.isChange);
        const nextChangeIndex = changeAddresses.length;

        // Generate addresses
        const newExternalAddress = await generateTaprootAddress(seedPhrase, nextExternalIndex, false);
        const newChangeAddress = await generateTaprootAddress(seedPhrase, nextChangeIndex, true);

        // Store addresses
        await addAddress({
            address: newExternalAddress,
            index: nextExternalIndex,
            isChange: false,
            created: new Date().toISOString()
        });
        await addAddress({
            address: newChangeAddress,
            index: nextChangeIndex,
            isChange: true,
            created: new Date().toISOString()
        });
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

    // Derive private keys when addresses change
    useEffect(() => {
        if (addresses.length > 0 && seedPhrase) {
            deriveAllPrivateKeys();
        }
    }, [addresses, seedPhrase]);

    const filteredAddresses = useMemo(() => {
        if (filter === 'in-use') {
            return addresses.filter(addr => utxos[addr.address] && utxos[addr.address].length > 0);
        }
        return addresses;
    }, [addresses, filter, utxos]);

    const visibleAddresses = useMemo(() => {
        return filteredAddresses.slice(0, visibleCount);
    }, [filteredAddresses, visibleCount]);

    const handleShowMore = () => {
        setVisibleCount(prevCount => prevCount + 8);
    };

    const canGenerateMore = filteredAddresses.length <= visibleCount;

    return (
        <div>
            {/* Title and controls outside the card */}
            <div>
                <AddressControls
                    onGenerateAddress={generateNewAddress}
                    error={addressError}
                    isCardano={isCardano()}
                    addressType={addressType}
                    onToggleAddressType={toggleAddressType}
                    filter={filter}
                    onFilterChange={setFilter}
                    canGenerateMore={canGenerateMore}
                />

                {addressError && (
                    <p className="px-6 mb-3 text-sm text-red-600">{addressError}</p>
                )}
            </div>

            {/* Main address container */}
            <div className="card mb-6">
                <AddressList
                    addresses={visibleAddresses}
                    privateKeys={privateKeys}
                    isCardano={isCardano()}
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
            </div>
        </div>
    );
}
