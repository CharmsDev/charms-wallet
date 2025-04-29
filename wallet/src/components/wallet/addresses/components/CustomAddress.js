'use client';

import AddressCard from './AddressCard';

export default function CustomAddress({
    address,
    privateKeys,
    onDelete
}) {
    return (
        <div className="glass-effect p-3 rounded-xl">
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
