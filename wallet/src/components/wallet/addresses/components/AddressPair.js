'use client';

import AddressCard from './AddressCard';

export default function AddressPair({
    index,
    externalAddr,
    changeAddr,
    privateKeys,
    onCollapse
}) {
    return (
        <div className="bg-gray-800 p-3 rounded-lg">
            <div className="flex justify-between items-center mb-3">
                <span className="font-bold text-gray-400">Index: {index}</span>
                <div>
                    <button
                        onClick={onCollapse}
                        className="px-3 py-1 text-xs text-white bg-gray-600 hover:bg-gray-700 rounded-full"
                    >
                        Collapse
                    </button>
                </div>
            </div>

            {/* Receiving address */}
            {externalAddr && (
                <div className="mb-2">
                    <AddressCard
                        address={externalAddr.address}
                        label="Receiving"
                        privateKey={privateKeys[externalAddr.address]}
                    />
                </div>
            )}

            {/* Change address */}
            {changeAddr && (
                <AddressCard
                    address={changeAddr.address}
                    label="Change"
                    privateKey={privateKeys[changeAddr.address]}
                />
            )}
        </div>
    );
}
