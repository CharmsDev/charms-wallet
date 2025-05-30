'use client';

import { organizeAddresses } from '@/utils/addressUtils';
import { organizeCardanoAddresses } from '@/utils/cardanoAddressUtils';
import AddressPair from './AddressPair';
import CustomAddress from './CustomAddress';
import CardanoAddress from './CardanoAddress';

export default function AddressList({
    addresses,
    privateKeys,
    onDeleteClick,
    isCardano
}) {
    if (addresses.length === 0) {
        return (
            <p className="text-dark-400">No addresses yet. Generate or import an address to get started.</p>
        );
    }

    if (isCardano) {
        // Group and organize Cardano addresses
        const { paymentAddresses, stakingAddresses } = organizeCardanoAddresses(addresses);

        return (
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                {/* Payment addresses section */}
                <div className="mb-4">
                    <h3 className="text-lg font-medium text-cardano-400 mb-2">Payment Addresses</h3>
                    {paymentAddresses.length === 0 ? (
                        <p className="text-dark-400">No payment addresses yet.</p>
                    ) : (
                        <div className="space-y-2">
                            {paymentAddresses.map(addr => (
                                <CardanoAddress
                                    key={addr.address}
                                    address={addr}
                                    privateKeys={privateKeys}
                                    onDelete={onDeleteClick}
                                    isStaking={false}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Staking addresses section */}
                <div>
                    <h3 className="text-lg font-medium text-cardano-400 mb-2">Staking Addresses</h3>
                    {stakingAddresses.length === 0 ? (
                        <p className="text-dark-400">No staking addresses yet.</p>
                    ) : (
                        <div className="space-y-2">
                            {stakingAddresses.map(addr => (
                                <CardanoAddress
                                    key={addr.address}
                                    address={addr}
                                    privateKeys={privateKeys}
                                    onDelete={onDeleteClick}
                                    isStaking={true}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    } else {
        // Group and organize Bitcoin addresses
        const { addressPairs, customAddresses } = organizeAddresses(addresses);

        return (
            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                {/* Address pairs */}
                {Object.entries(addressPairs).map(([index, addrGroup]) => {
                    const externalAddr = addrGroup.find(a => !a.isChange);
                    const changeAddr = addrGroup.find(a => a.isChange);

                    return (
                        <AddressPair
                            key={`pair-${index}`}
                            index={index}
                            externalAddr={externalAddr}
                            changeAddr={changeAddr}
                            privateKeys={privateKeys}
                            onDelete={() => onDeleteClick(externalAddr?.address || changeAddr?.address)}
                        />
                    );
                })}

                {/* Custom imported addresses */}
                {customAddresses.map(addr => (
                    <CustomAddress
                        key={addr.address}
                        address={addr}
                        privateKeys={privateKeys}
                        onDelete={onDeleteClick}
                    />
                ))}
            </div>
        );
    }
}
