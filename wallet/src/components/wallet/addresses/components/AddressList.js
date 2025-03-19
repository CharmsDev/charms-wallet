'use client';

import { organizeAddresses } from '@/utils/addressUtils';
import AddressPair from './AddressPair';
import CustomAddress from './CustomAddress';

export default function AddressList({
    addresses,
    privateKeys,
    onDeleteClick
}) {
    if (addresses.length === 0) {
        return (
            <p className="text-gray-500">No addresses yet. Generate or import an address to get started.</p>
        );
    }

    // Group and organize addresses
    const { addressPairs, customAddresses } = organizeAddresses(addresses);

    return (
        <div className="space-y-4 max-h-[500px] overflow-y-auto">
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
