'use client';

import { useState } from 'react';
import { useCharms } from '@/stores/charmsStore';
import { useAddresses } from '@/stores/addressesStore';
import TransferCharmDialog from './TransferCharmDialog';

export default function CharmCard({ charm }) {
    const { isNFT, getCharmDisplayName } = useCharms();
    const { addresses } = useAddresses();
    const isNftCharm = isNFT(charm);
    const [showTransferDialog, setShowTransferDialog] = useState(false);
    const [imageError, setImageError] = useState(false);

    // Find address entry for charm
    const addressEntry = addresses.find(addr => addr.address === charm.address);

    // Construct the derivation path
    const isChange = addressEntry?.isChange || false;
    const addressIndex = addressEntry?.index || 'Unknown';
    const derivationPath = addressIndex !== 'Unknown'
        ? `m/86'/0'/0'/${isChange ? '1' : '0'}/${addressIndex}`
        : 'Unknown';

    // Get charm metadata
    const name = charm.amount.name;
    const description = charm.amount.description;
    const image = !imageError && charm.amount.image;
    const url = charm.amount.url;
    const placeholderImage = "https://charms.dev/_astro/logo-charms-dark.Ceshk2t3.png";

    return (
        <div className="bg-white border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col h-full">
            {/* Image section */}
            <div className="w-full h-96 bg-gray-100 overflow-hidden">
                <img
                    src={image || placeholderImage}
                    alt={name || getCharmDisplayName(charm)}
                    className="w-full h-full object-cover"
                    onError={() => setImageError(true)}
                />
            </div>

            <div className="p-4 flex-grow flex flex-col">
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="font-medium text-gray-900">
                            {name || getCharmDisplayName(charm)}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                            {isNftCharm ? 'NFT' : 'Token'}
                        </p>
                    </div>
                    {!isNftCharm && (
                        <div className="text-right">
                            <span className="text-lg font-semibold">{charm.amount.remaining}</span>
                            <p className="text-xs text-gray-500">{charm.amount.ticker}</p>
                        </div>
                    )}
                </div>

                {/* Description section */}
                {description && (
                    <div className="mt-3">
                        <p className="text-sm text-gray-600">{description}</p>
                    </div>
                )}

                {/* URL section */}
                {url && (
                    <div className="mt-2">
                        <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-500 hover:underline"
                        >
                            Visit website
                        </a>
                    </div>
                )}

                <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex flex-col space-y-2 text-xs text-gray-500">
                        <div className="flex justify-between">
                            <span>ID:</span>
                            <span className="font-mono">{charm.id}</span>
                        </div>
                        <div className="flex flex-col">
                            <span>UTXO:</span>
                            <span className="font-mono break-all mt-1">{charm.txid}:{charm.outputIndex}</span>
                        </div>
                        <div className="flex flex-col">
                            <span>Address:</span>
                            <span className="font-mono break-all mt-1">{charm.address}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Address Type:</span>
                            <span className="font-mono">{isChange ? 'Change' : 'Receiver'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Address Index:</span>
                            <span className="font-mono">{addressIndex}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Derivation Path:</span>
                            <span className="font-mono">{derivationPath}</span>
                        </div>
                    </div>
                </div>

                <div className="mt-auto pt-4 border-t border-gray-100">
                    <button
                        onClick={() => setShowTransferDialog(true)}
                        className="w-full py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                    >
                        Transfer
                    </button>
                </div>
            </div>

            {showTransferDialog && (
                <TransferCharmDialog
                    charm={charm}
                    show={showTransferDialog}
                    onClose={() => setShowTransferDialog(false)}
                />
            )}
        </div>
    );
}
