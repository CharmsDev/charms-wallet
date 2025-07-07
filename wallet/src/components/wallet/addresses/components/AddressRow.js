'use client';

import { useState } from 'react';
import AddressPair from './AddressPair';
import { copyToClipboard } from '@/utils/addressUtils';

const CopyIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);

const AddressCell = ({ address, onCopy, isInUse, filter }) => {
    // Determine text color based on usage and filter
    let textColor = "text-dark-200"; // Default color

    if (filter === 'all' && isInUse) {
        textColor = "text-green-400"; // Green for in-use addresses in "All" view
    } else if (filter === 'in-use') {
        textColor = isInUse ? "text-green-400" : "text-dark-200"; // Green for in-use, normal for not in-use
    }

    return (
        <div className="flex items-center">
            <p className={`font-mono text-xs break-all ${textColor} flex-1`}>{address}</p>
            <button onClick={onCopy} className="ml-2 text-gray-400 hover:text-white">
                <CopyIcon />
            </button>
        </div>
    );
};

export default function AddressRow({ index, externalAddr, changeAddr, privateKeys, onDerivePrivateKey, utxos, filter }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isDerivingKeys, setIsDerivingKeys] = useState(false);

    const handleExpand = async () => {
        setIsExpanded(true);

        // Derive private keys on-demand if not already available
        if (!privateKeys[externalAddr?.address] && !privateKeys[changeAddr?.address] && onDerivePrivateKey) {
            setIsDerivingKeys(true);
            await onDerivePrivateKey(externalAddr, changeAddr);
            setIsDerivingKeys(false);
        }
    };

    if (isExpanded) {
        return (
            <tr>
                <td colSpan="4" className="p-0">
                    <AddressPair
                        index={index}
                        externalAddr={externalAddr}
                        changeAddr={changeAddr}
                        privateKeys={privateKeys}
                        onCollapse={() => setIsExpanded(false)}
                        isDerivingKeys={isDerivingKeys}
                    />
                </td>
            </tr>
        );
    }

    // Check if addresses are in use
    const externalInUse = externalAddr && utxos && utxos[externalAddr.address] && utxos[externalAddr.address].length > 0;
    const changeInUse = changeAddr && utxos && utxos[changeAddr.address] && utxos[changeAddr.address].length > 0;

    return (
        <tr className="bg-dark-800 hover:bg-dark-700">
            <td className="py-2 px-4 border-b border-dark-700 text-sm text-dark-300">{index}</td>
            <td className="py-2 px-4 border-b border-dark-700">
                {externalAddr && (
                    <AddressCell
                        address={externalAddr.address}
                        onCopy={() => copyToClipboard(externalAddr.address)}
                        isInUse={externalInUse}
                        filter={filter}
                    />
                )}
            </td>
            <td className="py-2 px-4 border-b border-dark-700">
                {changeAddr && (
                    <AddressCell
                        address={changeAddr.address}
                        onCopy={() => copyToClipboard(changeAddr.address)}
                        isInUse={changeInUse}
                        filter={filter}
                    />
                )}
            </td>
            <td className="py-2 px-4 border-b border-dark-700 text-right">
                <button onClick={handleExpand} className="btn btn-xs btn-secondary">
                    Expand
                </button>
            </td>
        </tr>
    );
}
