'use client';

import { useState } from 'react';
import { useCharms } from '@/stores/charmsStore';
import TransferCharmWizard from './transfer/TransferCharmWizard';

/**
 * Card component for displaying individual Charm NFTs
 * Each NFT is unique and displayed as a separate card
 */
export default function CharmNFTCard({ nft }) {
    const { getCharmDisplayName } = useCharms();
    const [showTransferDialog, setShowTransferDialog] = useState(false);
    const [imageError, setImageError] = useState(false);
    
    const handleTransferClick = () => {
        setShowTransferDialog(true);
    };

    const name = nft.name || nft.metadata?.name || getCharmDisplayName(nft);
    const description = nft.description || nft.metadata?.description || '';
    const image = !imageError && (nft.image || nft.metadata?.image);
    const url = nft.url || nft.metadata?.url || null;
    const placeholderImage = "https://charms.dev/_astro/logo-charms-dark.Ceshk2t3.png";

    return (
        <div className="card card-hover flex flex-col h-full">
            {/* Image section */}
            <div className="w-full h-48 bg-dark-800 overflow-hidden">
                <img
                    src={image || placeholderImage}
                    alt={name || getCharmDisplayName(nft)}
                    className="w-full h-full object-cover"
                    onError={() => setImageError(true)}
                />
            </div>

            <div className="p-4 flex-grow flex flex-col">
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="font-bold text-white">
                            {name || getCharmDisplayName(nft)}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-900/30 text-primary-400">
                                NFT
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-900/30 text-green-400 border border-green-500/20">
                                ✓ Validated Proof
                            </span>
                        </div>
                    </div>
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
                        <div className="nft-id">
                            <span className="label">NFT ID:</span>
                            <span className="value">{nft.appId}</span>
                        </div>
                        <div className="flex flex-col">
                            <span>UTXO:</span>
                            <span className="font-mono break-all mt-1 text-dark-300">{nft.txid}:{nft.outputIndex}</span>
                        </div>
                        <div className="flex flex-col">
                            <span>Address:</span>
                            <span className="font-mono break-all mt-1 text-dark-300">{nft.address}</span>
                        </div>
                    </div>
                </div>

                <div className="mt-auto pt-4 border-t border-dark-700 flex justify-end">
                    <button
                        onClick={handleTransferClick}
                        className="px-4 py-1.5 text-sm btn btn-primary"
                        title="Send NFT"
                    >
                        Send
                    </button>
                </div>
            </div>

            {showTransferDialog && (
                <TransferCharmWizard
                    charm={nft}
                    show={showTransferDialog}
                    onClose={() => setShowTransferDialog(false)}
                />
            )}
        </div>
    );
}
