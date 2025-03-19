'use client';

import AddressCard from './AddressCard';

export default function CustomAddress({
    address,
    privateKeys,
    onDelete
}) {
    return (
        <div className="bg-gray-50 p-3 rounded-md">
            <AddressCard
                address={address.address}
                label="Custom"
                borderColor="border-gray-400"
                privateKey={address.privateKey || privateKeys[address.address]}
                onDelete={() => onDelete(address.address)}
                showDeleteButton={true}
            />
        </div>
    );
}
