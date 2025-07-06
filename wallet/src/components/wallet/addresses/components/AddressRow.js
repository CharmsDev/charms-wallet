'use client';

import { useState } from 'react';
import AddressPair from './AddressPair';
import { copyToClipboard } from '@/utils/addressUtils';

const CopyIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);

const AddressCell = ({ address, onCopy }) => (
    <div className="flex items-center">
        <p className="font-mono text-xs break-all text-dark-200 flex-1">{address}</p>
        <button onClick={onCopy} className="ml-2 text-gray-400 hover:text-white">
            <CopyIcon />
        </button>
    </div>
);

export default function AddressRow({ index, externalAddr, changeAddr, privateKeys }) {
    const [isExpanded, setIsExpanded] = useState(false);

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
                    />
                </td>
            </tr>
        );
    }

    return (
        <tr className="bg-dark-800 hover:bg-dark-700">
            <td className="py-2 px-4 border-b border-dark-700 text-sm text-dark-300">{index}</td>
            <td className="py-2 px-4 border-b border-dark-700">
                {externalAddr && <AddressCell address={externalAddr.address} onCopy={() => copyToClipboard(externalAddr.address)} />}
            </td>
            <td className="py-2 px-4 border-b border-dark-700">
                {changeAddr && <AddressCell address={changeAddr.address} onCopy={() => copyToClipboard(changeAddr.address)} />}
            </td>
            <td className="py-2 px-4 border-b border-dark-700 text-right">
                <button onClick={() => setIsExpanded(true)} className="btn btn-xs btn-secondary">
                    Expand
                </button>
            </td>
        </tr>
    );
}
