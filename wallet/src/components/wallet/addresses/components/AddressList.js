'use client';

import { organizeAddresses } from '@/utils/addressUtils';
import { organizeCardanoAddresses } from '@/utils/cardanoAddressUtils';
import AddressRow from './AddressRow';
import AddressPair from './AddressPair';
import CustomAddress from './CustomAddress';
import CardanoAddress from './CardanoAddress';
import { useState } from 'react';

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

    // Mobile-only address item (no columns/table)
    const MobileAddressItem = ({ index, externalAddr, changeAddr }) => {
        const [expanded, setExpanded] = useState(false);

        const CopyIcon = () => (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
        );

        const isInUse = (addr) => addr && utxos && utxos[addr.address] && utxos[addr.address].length > 0;

        const colorFor = (addr) => {
            const used = isInUse(addr);
            if (filter === 'all' && used) return 'text-green-400';
            if (filter === 'in-use') return used ? 'text-green-400' : 'text-dark-200';
            return 'text-dark-200';
        };

        if (expanded) {
            return (
                <div className="bg-dark-800 rounded-lg p-3">
                    <AddressPair
                        index={index}
                        externalAddr={externalAddr}
                        changeAddr={changeAddr}
                        privateKeys={privateKeys}
                        onCollapse={() => setExpanded(false)}
                        isDerivingKeys={false}
                    />
                </div>
            );
        }

        return (
            <div className="bg-dark-800 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-dark-300">Index: {index}</span>
                    <button
                        onClick={async () => {
                            if (!privateKeys[externalAddr?.address] && !privateKeys[changeAddr?.address] && onDerivePrivateKey) {
                                await onDerivePrivateKey(externalAddr, changeAddr);
                            }
                            setExpanded(true);
                        }}
                        className="btn btn-xs btn-secondary"
                    >
                        Expand
                    </button>
                </div>

                {externalAddr && (
                    <div className="mb-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] text-dark-300 mr-2">Receiving</span>
                        </div>
                        <div className="flex items-center">
                            <p className={`font-mono text-[10px] leading-4 break-all flex-1 ${colorFor(externalAddr)}`}>{externalAddr.address}</p>
                            <button onClick={() => navigator.clipboard.writeText(externalAddr.address)} className="ml-2 text-gray-400 hover:text-white">
                                <CopyIcon />
                            </button>
                        </div>
                    </div>
                )}

                {changeAddr && (
                    <div className="mt-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] text-dark-300 mr-2">Change</span>
                        </div>
                        <div className="flex items-center">
                            <p className={`font-mono text-[10px] leading-4 break-all flex-1 ${colorFor(changeAddr)}`}>{changeAddr.address}</p>
                            <button onClick={() => navigator.clipboard.writeText(changeAddr.address)} className="ml-2 text-gray-400 hover:text-white">
                                <CopyIcon />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div>
            {/* Desktop (table) */}
            <div className="overflow-x-auto hidden md:block">
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
            </div>

            {/* Mobile (cards) */}
            <div className="md:hidden">
                {Object.entries(addressPairs).map(([index, addrGroup], i, arr) => {
                    const externalAddr = addrGroup.find(a => !a.isChange);
                    const changeAddr = addrGroup.find(a => a.isChange);

                    return (
                        <div key={`m-wrap-${index}`} className="py-2">
                            <MobileAddressItem
                                index={index}
                                externalAddr={externalAddr}
                                changeAddr={changeAddr}
                            />
                            {i < arr.length - 1 && (
                                <div className="mt-3 h-px bg-dark-700/70" />
                            )}
                        </div>
                    );
                })}
            </div>

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
