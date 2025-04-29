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
        <div className="card card-hover flex flex-col h-full">
            {/* Image section */}
            <div className="w-full h-48 bg-dark-800 overflow-hidden">
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
                        <h3 className="font-bold text-white">
                            {name || getCharmDisplayName(charm)}
                        </h3>
                        <p className="text-sm text-dark-300 mt-1">
                            {isNftCharm ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-900/30 text-primary-400">
                                    NFT
                                </span>
                            ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-bitcoin-900/30 text-bitcoin-400">
                                    Token
                                </span>
                            )}
                        </p>
                    </div>
                    {!isNftCharm && (
                        <div className="text-right">
                            <span className="text-lg font-bold text-bitcoin-400 bitcoin-glow-text">{charm.amount.remaining}</span>
                            <p className="text-xs text-dark-300">{charm.amount.ticker}</p>
                        </div>
                    )}
                </div>

                {/* Description section */}
                {description && (
                    <div className="mt-3">
                        <p className="text-sm text-dark-300">{description}</p>
                    </div>
                )}

                {/* URL section */}
                {url && (
                    <div className="mt-2">
                        <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary-400 hover:underline"
                        >
                            Visit website
                        </a>
                    </div>
                )}

                <div className="mt-4 pt-4 border-t border-dark-700">
                    <div className="flex flex-col space-y-2 text-xs text-dark-400">
                        <div className="flex justify-between">
                            <span>ID:</span>
                            <span className="font-mono text-dark-300">{charm.id}</span>
                        </div>
                        <div className="flex flex-col">
                            <span>UTXO:</span>
                            <span className="font-mono break-all mt-1 text-dark-300">{charm.txid}:{charm.outputIndex}</span>
                        </div>
                        <div className="flex flex-col">
                            <span>Address:</span>
                            <span className="font-mono break-all mt-1 text-dark-300">{charm.address}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Address Type:</span>
                            <span className="font-mono text-dark-300">{isChange ? 'Change' : 'Receiver'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Address Index:</span>
                            <span className="font-mono text-dark-300">{addressIndex}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Derivation Path:</span>
                            <span className="font-mono text-dark-300">{derivationPath}</span>
                        </div>
                    </div>
                </div>

                <div className="mt-auto pt-4 border-t border-dark-700">
                    <button
                        onClick={() => setShowTransferDialog(true)}
                        className="w-full btn btn-primary"
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
