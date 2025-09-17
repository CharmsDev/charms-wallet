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


    // Extract data from CharmObj - follow the standard CharmObj structure
    const name = charm.name || charm.metadata?.name || getCharmDisplayName(charm);
    const description = charm.description || charm.metadata?.description || '';
    const image = !imageError && (charm.image || charm.metadata?.image);
    const url = charm.url || charm.metadata?.url || null;
    // Prefer explicit ticker, then metadata, then amount.ticker if amount is structured
    const ticker = charm.ticker || charm.metadata?.ticker || charm.amount?.ticker || '';
    
    // Handle amount - ensure we never render an object
    // Prefer displayAmount (already normalized). If not present, derive from amount:
    // - if amount is an object, use amount.remaining
    // - if amount is a number/string, use it directly
    let displayAmount = charm.displayAmount;
    if (displayAmount === undefined || displayAmount === null) {
        if (charm && typeof charm.amount === 'object' && charm.amount !== null) {
            displayAmount = charm.amount?.remaining ?? 0;
        } else {
            displayAmount = charm?.amount ?? 0;
        }
    }
    
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
                        <div className="flex items-center gap-2 mt-1">
                            {isNftCharm ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-900/30 text-primary-400">
                                    NFT
                                </span>
                            ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-bitcoin-900/30 text-bitcoin-400">
                                    Token
                                </span>
                            )}
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-900/30 text-green-400 border border-green-500/20">
                                ✓ Validated Proof
                            </span>
                        </div>
                    </div>
                    {!isNftCharm && (
                        <div className="text-right">
                            <span className="text-lg font-bold text-bitcoin-400 bitcoin-glow-text">{displayAmount}</span>
                            <p className="text-xs text-dark-300">
                                {ticker}
                            </p>
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
                        <div className="charm-id">
                            <span className="label">ID:</span>
                            <span className="value">{charm.appId}</span>
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
                        onClick={undefined}
                        disabled={true}
                        className="w-full btn btn-disabled opacity-50 cursor-not-allowed bg-gray-600"
                        title="Transfer (temporarily disabled)"
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
