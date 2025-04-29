'use client';

import AddressCard from './AddressCard';

export default function AddressPair({
    index,
    externalAddr,
    changeAddr,
    privateKeys,
    onDelete
}) {
    return (
        <div className="glass-effect p-4 rounded-xl">
            <div className="flex justify-between items-center mb-2">
                <span className="font-medium text-sm text-primary-400">Address Pair - Index: {index}</span>
                <button
                    onClick={onDelete}
                    className="px-3 py-1 text-xs text-white bg-red-600 hover:bg-red-700 rounded-full"
                >
                    Delete Pair
                </button>
            </div>

            {/* Receiving address */}
            {externalAddr && (
                <div className="mb-2">
                    <AddressCard
                        address={externalAddr.address}
                        label="Receiving Address"
                        borderColor="border-primary-500"
                        privateKey={privateKeys[externalAddr.address]}
                    />
                </div>
            )}

            {/* Change address */}
            {changeAddr && (
                <AddressCard
                    address={changeAddr.address}
                    label="Change Address"
                    borderColor="border-bitcoin-500"
                    privateKey={privateKeys[changeAddr.address]}
                />
            )}
        </div>
    );
}
