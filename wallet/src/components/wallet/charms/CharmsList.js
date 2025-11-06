'use client';

import { useState, useEffect, useMemo } from 'react';
import { useCharms } from '@/stores/charmsStore';
import { useWalletSync } from '@/hooks/useWalletSync';
import CharmNFTCard from './CharmNFTCard';
import CharmTokenCard from './CharmTokenCard';

export default function CharmsList() {
    const { charms, error, groupTokensByAppId, getNFTs } = useCharms();
    const { syncCharmsOnly, isSyncing, syncProgress } = useWalletSync();
    const [selectedType, setSelectedType] = useState('all'); // 'all', 'nft', 'token'
    
    // Use syncProgress for loading state
    const isLoading = isSyncing && syncProgress.phase === 'charms';

    // Auto-scroll to show new charms when they're added during loading
    useEffect(() => {
        if (isLoading && charms.length > 0) {
            // Smooth scroll to show the newly added charms
            const timer = setTimeout(() => {
                const charmsGrid = document.querySelector('.grid');
                if (charmsGrid) {
                    const lastCharm = charmsGrid.lastElementChild;
                    if (lastCharm) {
                        lastCharm.scrollIntoView({ 
                            behavior: 'smooth', 
                            block: 'nearest' 
                        });
                    }
                }
            }, 200);
            return () => clearTimeout(timer);
        }
    }, [charms.length, isLoading]);

    // Get NFTs and grouped tokens
    const nfts = useMemo(() => getNFTs(), [charms, getNFTs]);
    const groupedTokens = useMemo(() => groupTokensByAppId(), [charms, groupTokensByAppId]);

    // Filter based on selected type
    const displayItems = useMemo(() => {
        if (selectedType === 'all') {
            return [...nfts, ...groupedTokens];
        }
        if (selectedType === 'nft') {
            return nfts;
        }
        if (selectedType === 'token') {
            return groupedTokens;
        }
        return [];
    }, [nfts, groupedTokens, selectedType]);

    return (
        <div>
            {/* Title and controls outside the card */}
            <div className="p-6 flex items-center">
                <h2 className="text-xl font-bold gradient-text mr-6 hidden md:block">Your Charms</h2>

                {/* Filter tabs */}
                <div className="flex space-x-2 mr-auto">
                    <button
                        className={`px-3 py-1 rounded-full text-sm ${selectedType === 'all'
                            ? 'bg-primary-600/20 text-primary-400'
                            : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
                            }`}
                        onClick={() => setSelectedType('all')}
                    >
                        All
                    </button>
                    <button
                        className={`px-3 py-1 rounded-full text-sm ${selectedType === 'nft'
                            ? 'bg-primary-600/20 text-primary-400'
                            : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
                            }`}
                        onClick={() => setSelectedType('nft')}
                    >
                        NFTs
                    </button>
                    <button
                        className={`px-3 py-1 rounded-full text-sm ${selectedType === 'token'
                            ? 'bg-primary-600/20 text-primary-400'
                            : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
                            }`}
                        onClick={() => setSelectedType('token')}
                    >
                        Tokens
                    </button>
                </div>

                <button
                    onClick={syncCharmsOnly}
                    className="btn btn-primary flex items-center gap-2"
                    disabled={isSyncing}
                    aria-busy={isSyncing}
                >
                    {isSyncing && (
                        <span className="inline-block animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white" />
                    )}
                    {isSyncing ? 'Refreshing…' : 'Refresh'}
                </button>
            </div>

            {/* Main content card */}
            <div className="card p-6">
                {error && (
                    <div className="error-message">
                        Error: {error}
                    </div>
                )}

                {/* Show loading indicator only when no charms are loaded yet */}
                {isLoading && charms.length === 0 ? (
                    <div className="text-center py-8">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500"></div>
                        <p className="mt-2 text-dark-300">
                            {syncProgress.total > 0 ? 
                                `Scanning transactions for charms... (${syncProgress.current}/${syncProgress.total})` : 
                                'Scanning transactions for charms...'
                            }
                        </p>
                        {syncProgress.total > 0 && (
                            <div className="mt-4 w-full max-w-xs mx-auto">
                                <div className="bg-dark-700 rounded-full h-2">
                                    <div 
                                        className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                                        style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        )}
                    </div>
                ) : displayItems.length === 0 && !isLoading ? (
                    <div className="text-center py-8 glass-effect rounded-xl">
                        <p className="text-dark-300">No charms found.</p>
                        {selectedType !== 'all' && (
                            <p className="text-dark-400 mt-2">
                                Try selecting a different filter or refreshing.
                            </p>
                        )}
                    </div>
                ) : (
                    <div>
                        {/* Show loading progress when charms are being loaded */}
                        {isLoading && loadingProgress && (
                            <div className="mb-4 p-3 bg-dark-800/50 rounded-lg border border-primary-500/20">
                                <div className="flex items-center justify-between text-sm text-dark-300 mb-2">
                                    <span>🔄 {charms.length === 0 ? 'Scanning transactions for charms...' : 'Scanning more transactions...'}</span>
                                    <span>{loadingProgress.current}/{loadingProgress.total}</span>
                                </div>
                                <div className="bg-dark-700 rounded-full h-1.5">
                                    <div 
                                        className="bg-primary-500 h-1.5 rounded-full transition-all duration-300"
                                        style={{ width: `${(loadingProgress.current / loadingProgress.total) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        )}
                        
                        {/* Always show charms grid, even during loading */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {displayItems.map((item, index) => {
                                // Check if item is a grouped token (has tokenUtxos array) or an NFT
                                const isGroupedToken = item.tokenUtxos && Array.isArray(item.tokenUtxos);
                                
                                if (isGroupedToken) {
                                    return (
                                        <CharmTokenCard 
                                            key={`token-${item.appId}`}
                                            groupedToken={item}
                                            className="animate-fade-in"
                                        />
                                    );
                                } else {
                                    return (
                                        <CharmNFTCard 
                                            key={`nft-${item.txid}-${item.outputIndex}`}
                                            nft={item}
                                            className="animate-fade-in"
                                        />
                                    );
                                }
                            })}
                        </div>
                        
                        {/* Show a subtle indicator when new charms are being added */}
                        {isLoading && (
                            <div className="mt-4 text-center">
                                <div className="inline-flex items-center gap-2 text-sm text-dark-400">
                                    <div className="animate-pulse w-2 h-2 bg-primary-500 rounded-full"></div>
                                    <span>Scanning transactions for charms...</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
