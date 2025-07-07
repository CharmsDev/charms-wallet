'use client';

import { organizeAddresses } from '@/utils/addressUtils';
import { organizeCardanoAddresses } from '@/utils/cardanoAddressUtils';
import AddressRow from './AddressRow';
import CustomAddress from './CustomAddress';
import CardanoAddress from './CardanoAddress';

export default function AddressList({
    addresses,
    privateKeys,
    isCardano,
    onDerivePrivateKey,
    utxos,
    filter
}) {
    if (addresses.length === 0) {
        return (
            <p className="text-dark-400 p-4 text-center">No addresses found for the current filter.</p>
        );
    }

    if (isCardano) {
        // ... (Cardano implementation remains the same)
    }

    const { addressPairs, customAddresses } = organizeAddresses(addresses);

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full">
                <thead className="bg-dark-700">
                    <tr>
                        <th className="py-2 px-4 border-b border-dark-600 text-left text-dark-300 w-12">#</th>
                        <th className="py-2 px-4 border-b border-dark-600 text-left text-dark-300">Receiving</th>
                        <th className="py-2 px-4 border-b border-dark-600 text-left text-dark-300">Change</th>
                        <th className="py-2 px-4 border-b border-dark-600 text-left text-dark-300 w-24"></th>
                    </tr>
                </thead>
                <tbody>
                    {Object.entries(addressPairs).map(([index, addrGroup]) => {
                        const externalAddr = addrGroup.find(a => !a.isChange);
                        const changeAddr = addrGroup.find(a => a.isChange);

                        return (
                            <AddressRow
                                key={`pair-${index}`}
                                index={index}
                                externalAddr={externalAddr}
                                changeAddr={changeAddr}
                                privateKeys={privateKeys}
                                onDerivePrivateKey={onDerivePrivateKey}
                                utxos={utxos}
                                filter={filter}
                            />
                        );
                    })}
                </tbody>
            </table>

            {/* Custom imported addresses can be listed separately if needed */}
            {customAddresses.length > 0 && (
                <div className="mt-4">
                    <h3 className="text-lg font-medium text-primary-400 mb-2">Custom Addresses</h3>
                    <div className="space-y-2">
                        {customAddresses.map(addr => (
                            <CustomAddress
                                key={addr.address}
                                address={addr}
                                privateKeys={privateKeys}
                                onDelete={onDeleteClick}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
