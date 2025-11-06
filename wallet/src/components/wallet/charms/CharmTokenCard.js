'use client';

import { useState } from 'react';
import TransferCharmWizard from './transfer/TransferCharmWizard';

/**
 * Card component for displaying grouped Charm Tokens by APP ID
 * Shows total token amount and expandable list of individual token UTXOs
 */
export default function CharmTokenCard({ groupedToken }) {
    const [showTransferDialog, setShowTransferDialog] = useState(false);
    const [imageError, setImageError] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    
    const handleTransferTokenClick = () => {
        setShowTransferDialog(true);
    };

    const placeholderImage = "https://charms.dev/_astro/logo-charms-dark.Ceshk2t3.png";

    return (
        <div className="card card-hover flex flex-col h-full">
            {/* Image section */}
            <div className="w-full h-48 bg-dark-800 overflow-hidden">
                <img
                    src={groupedToken.image && !imageError ? groupedToken.image : placeholderImage}
                    alt={groupedToken.name}
                    className="w-full h-full object-cover"
                    onError={() => setImageError(true)}
                />
            </div>

            <div className="p-4 flex-grow flex flex-col">
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="font-bold text-white">
                            {groupedToken.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-bitcoin-900/30 text-bitcoin-400">
                                Token
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-900/30 text-green-400 border border-green-500/20">
                                ✓ Validated Proof
                            </span>
                        </div>
                    </div>
                    <div className="text-right">
                        <span className="text-lg font-bold text-bitcoin-400 bitcoin-glow-text">
                            {groupedToken.totalAmount.toLocaleString()}
                        </span>
                        <p className="text-xs text-dark-300">
                            {groupedToken.ticker}
                        </p>
                    </div>
                </div>

                {/* Description section */}
                {groupedToken.description && (
                    <div className="mt-3">
                        <p className="text-sm text-dark-300">{groupedToken.description}</p>
                    </div>
                )}

                {/* URL section */}
                {groupedToken.url && (
                    <div className="mt-2">
                        <a
                            href={groupedToken.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary-400 hover:underline"
                        >
                            Visit website
                        </a>
                    </div>
                )}

                {/* Token ID */}
                <div className="mt-4 pt-4 border-t border-dark-700">
                    <div className="flex flex-col space-y-2 text-xs text-dark-400">
                        <div className="token-id">
                            <span className="label">Token ID:</span>
                            <span className="value">{groupedToken.appId}</span>
                        </div>
                    </div>
                </div>

                {/* Token UTXOs Section - Expandable */}
                <div className="mt-4 pt-4 border-t border-dark-700">
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="w-full flex items-center justify-between text-sm text-dark-300 hover:text-white transition-colors"
                    >
                        <span className="font-medium">
                            Token UTXOs ({groupedToken.tokenUtxos.length})
                        </span>
                        <svg 
                            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>

                    {isExpanded && (
                        <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                            {groupedToken.tokenUtxos.map((tokenUtxo, index) => {
                                // Calculate amount for this token UTXO
                                let tokenAmount = tokenUtxo.displayAmount;
                                if (tokenAmount === undefined || tokenAmount === null) {
                                    if (tokenUtxo && typeof tokenUtxo.amount === 'object' && tokenUtxo.amount !== null) {
                                        tokenAmount = tokenUtxo.amount?.remaining ?? 0;
                                    } else {
                                        tokenAmount = tokenUtxo?.amount ?? 0;
                                    }
                                }

                                return (
                                    <div 
                                        key={`${tokenUtxo.txid}-${tokenUtxo.outputIndex}`}
                                        className="bg-dark-800/50 rounded-lg p-3 border border-dark-700 hover:border-primary-500/30 transition-colors"
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex-1">
                                                <div className="text-xs text-dark-400 mb-1">Token UTXO #{index + 1}</div>
                                                <div className="font-mono text-xs text-dark-300 break-all">
                                                    {tokenUtxo.txid}:{tokenUtxo.outputIndex}
                                                </div>
                                            </div>
                                            <div className="text-right ml-3">
                                                <div className="text-sm font-bold text-bitcoin-400">
                                                    {Number(tokenAmount).toLocaleString()}
                                                </div>
                                                <div className="text-xs text-dark-400">
                                                    {groupedToken.ticker}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="mt-2 pt-2 border-t border-dark-700">
                                            <div className="font-mono text-xs text-dark-400 truncate">
                                                {tokenUtxo.address}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Send Button */}
                <div className="mt-auto pt-4 border-t border-dark-700 flex justify-end">
                    <button
                        onClick={handleTransferTokenClick}
                        className="px-4 py-1.5 text-sm btn btn-primary"
                        title="Send tokens"
                    >
                        Send
                    </button>
                </div>
            </div>

            {showTransferDialog && (
                <TransferCharmWizard
                    charm={{
                        ...groupedToken.tokenUtxos[0],
                        totalAmount: groupedToken.totalAmount,
                        allUtxos: groupedToken.tokenUtxos
                    }}
                    show={showTransferDialog}
                    onClose={() => {
                        setShowTransferDialog(false);
                    }}
                />
            )}
        </div>
    );
}
