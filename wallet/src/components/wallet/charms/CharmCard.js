'use client';

import { useState } from 'react';
import { useCharms } from '@/stores/charmsStore';
import { useAddresses } from '@/stores/addressesStore';
import TransferCharmDialog from './TransferCharmDialog';

/**
 * Renders a card component to display the details of a single Charm.
 * The card includes the Charm's image, name, type (NFT or Token), and other metadata.
 * It also provides an action to initiate a transfer.
 *
 * @param {object} props - The component props.
 * @param {object} props.charm - The Charm object containing its data.
 * @returns {JSX.Element}
 */
export default function CharmCard({ charm }) {
    const { isNFT, getCharmDisplayName } = useCharms();
    const isNftCharm = isNFT(charm);
    const [showTransferDialog, setShowTransferDialog] = useState(false);
    const [imageError, setImageError] = useState(false);

    // Extract charm metadata with priority for enhanced data
    const name = charm.name || charm.amount?.name;
    const description = charm.description || charm.amount?.description;
    const image = !imageError && (charm.image || charm.amount?.image);
    const displayAmount = charm.displayAmount || charm.amount?.remaining;
    const placeholderImage = "https://charms.dev/_astro/logo-charms-dark.Ceshk2t3.png";
    const url = charm.url || charm.amount?.url;

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
                            <span className="text-lg font-bold text-bitcoin-400 bitcoin-glow-text">{displayAmount}</span>
                            <p className="text-xs text-dark-300">{charm.amount?.ticker}</p>
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
                        <div className="flex flex-col">
                            <span>ID:</span>
                            <span className="font-mono break-all mt-1 text-dark-300">{charm.id}</span>
                        </div>
                        <div className="flex flex-col">
                            <span>UTXO:</span>
                            <span className="font-mono break-all mt-1 text-dark-300">{charm.txid}:{charm.outputIndex}</span>
                        </div>
                        <div className="flex flex-col">
                            <span>Address:</span>
                            <span className="font-mono break-all mt-1 text-dark-300">{charm.address}</span>
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
