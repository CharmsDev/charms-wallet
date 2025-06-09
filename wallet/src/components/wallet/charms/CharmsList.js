'use client';

import { useState, useEffect } from 'react';
import { useCharms } from '@/stores/charmsStore';
import CharmCard from './CharmCard';

export default function CharmsList() {
    const { charms, isLoading, error, loadCharms, refreshCharms, isNFT, getCharmDisplayName } = useCharms();
    const [selectedType, setSelectedType] = useState('all'); // 'all', 'nft', 'token'

    // Load charms on mount
    useEffect(() => {
        loadCharms();
    }, []);

    const filteredCharms = charms.filter(charm => {
        if (selectedType === 'all') return true;
        if (selectedType === 'nft') return isNFT(charm);
        if (selectedType === 'token') return !isNFT(charm);
        return true;
    });

    return (
        <div>
            {/* Title and controls outside the card */}
            <div className="p-6 flex items-center">
                <h2 className="text-xl font-bold gradient-text mr-6 hidden md:block">My Charms</h2>

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
                    onClick={refreshCharms}
                    className="btn btn-primary"
                    disabled={isLoading}
                >
                    {isLoading ? 'Loading...' : 'Refresh'}
                </button>
            </div>

            {/* Main content card */}
            <div className="card p-6">
                {error && (
                    <div className="error-message">
                        Error: {error}
                    </div>
                )}

                {isLoading ? (
                    <div className="text-center py-8">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500"></div>
                        <p className="mt-2 text-dark-300">Loading charms...</p>
                    </div>
                ) : filteredCharms.length === 0 ? (
                    <div className="text-center py-8 glass-effect rounded-xl">
                        <p className="text-dark-300">No charms found.</p>
                        {selectedType !== 'all' && (
                            <p className="text-dark-400 mt-2">
                                Try selecting a different filter or refreshing.
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredCharms.map((charm) => (
                            <CharmCard key={charm.uniqueId} charm={charm} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
