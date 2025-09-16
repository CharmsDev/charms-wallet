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

    // Debug logging to identify problematic data
    console.log('CharmCard received charm:', charm);
    console.log('CharmCard metadata:', charm.metadata);
    console.log('CharmCard amount:', charm.amount);
    console.log('CharmCard amount type:', typeof charm.amount);
    if (typeof charm.amount === 'object') {
        console.log('CharmCard amount keys:', Object.keys(charm.amount));
        console.log('CharmCard amount values:', Object.values(charm.amount));
    }

    // Extract charm metadata from CharmObj structure - ensure all values are strings
    const name = typeof (charm.metadata?.name || charm.name) === 'string' 
        ? (charm.metadata?.name || charm.name) 
        : JSON.stringify(charm.metadata?.name || charm.name || '');
    const description = typeof (charm.metadata?.description || charm.description) === 'string' 
        ? (charm.metadata?.description || charm.description) 
        : JSON.stringify(charm.metadata?.description || charm.description || '');
    const image = !imageError && (charm.metadata?.image || charm.image);
    // Ensure amount is a number, not an object
    let displayAmount = 0;
    if (typeof charm.amount === 'number') {
        displayAmount = charm.amount;
    } else if (typeof charm.amount === 'object' && charm.amount !== null) {
        // If amount is an object, try to extract a numeric value
        displayAmount = charm.amount.value || charm.amount.amount || charm.amount.remaining || 0;
        console.warn('Amount was an object, extracted value:', displayAmount);
    } else {
        displayAmount = 0;
        console.warn('Amount was not a number or object, defaulting to 0');
    }
    const placeholderImage = "https://charms.dev/_astro/logo-charms-dark.Ceshk2t3.png";
    const url = typeof (charm.metadata?.url || charm.url) === 'string' 
        ? (charm.metadata?.url || charm.url) 
        : null;

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
                            <p className="text-xs text-dark-300">
                                {typeof charm.metadata?.ticker === 'string' 
                                    ? charm.metadata.ticker 
                                    : (charm.metadata?.ticker ? JSON.stringify(charm.metadata.ticker) : '')
                                }
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
