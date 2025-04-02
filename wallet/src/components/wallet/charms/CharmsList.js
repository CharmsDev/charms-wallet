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
        <div className="bg-white shadow rounded-lg p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-gray-800">My Charms</h2>
                <button
                    onClick={refreshCharms}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                    disabled={isLoading}
                >
                    {isLoading ? 'Loading...' : 'Refresh'}
                </button>
            </div>

            {/* Filter tabs */}
            <div className="flex space-x-4 mb-6">
                <button
                    className={`px-4 py-2 rounded-md ${selectedType === 'all'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    onClick={() => setSelectedType('all')}
                >
                    All
                </button>
                <button
                    className={`px-4 py-2 rounded-md ${selectedType === 'nft'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    onClick={() => setSelectedType('nft')}
                >
                    NFTs
                </button>
                <button
                    className={`px-4 py-2 rounded-md ${selectedType === 'token'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    onClick={() => setSelectedType('token')}
                >
                    Tokens
                </button>
            </div>

            {error && (
                <div className="bg-red-100 text-red-700 p-4 rounded-md mb-4">
                    Error: {error}
                </div>
            )}

            {isLoading ? (
                <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                    <p className="mt-2 text-gray-600">Loading charms...</p>
                </div>
            ) : filteredCharms.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                    <p className="text-gray-500">No charms found.</p>
                    {selectedType !== 'all' && (
                        <p className="text-gray-400 mt-2">
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
    );
}
