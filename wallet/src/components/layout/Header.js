'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useBlockchain, BLOCKCHAINS, NETWORKS } from '@/stores/blockchainStore';

export default function Header({ activeSection, setActiveSection }) {
    const {
        activeBlockchain,
        activeNetwork,
        saveBlockchain,
        saveNetwork,
        getAvailableNetworks,
        isBitcoin,
        isCardano
    } = useBlockchain();

    const [networkDropdownOpen, setNetworkDropdownOpen] = useState(false);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Handle blockchain selection
    const handleBlockchainSelect = (blockchain) => {
        saveBlockchain(blockchain);
    };

    // Handle network selection
    const handleNetworkSelect = (network) => {
        saveNetwork(network);
        setNetworkDropdownOpen(false);
    };

    // Calculate dropdown position relative to button
    const handleDropdownToggle = (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setDropdownPosition({
            top: rect.bottom + 8, // 8px below the button
            right: window.innerWidth - rect.right // Align right edge with button
        });
        setNetworkDropdownOpen(!networkDropdownOpen);
    };

    // Get available networks for the current blockchain
    const availableNetworks = getAvailableNetworks();

    // Get network display name
    const getNetworkDisplayName = () => {
        const network = availableNetworks.find(n => n.id === activeNetwork);
        return network ? network.name : activeNetwork;
    };

    // Get blockchain display class
    const getBlockchainClass = (blockchain) => {
        if (blockchain === activeBlockchain) {
            return blockchain === BLOCKCHAINS.BITCOIN
                ? "bg-bitcoin-500/20 text-bitcoin-400 bitcoin-glow-text"
                : "bg-cardano-500/20 text-cardano-400 cardano-glow-text";
        }
        return "bg-dark-700/30 text-dark-400 hover:bg-dark-700/50";
    };

    return (
        <div className="fixed-header">
            {/* Header section */}
            <header className="glass-effect">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex justify-between items-center">
                        {/* Logo section */}
                        <div className="flex items-center">
                            <img
                                src="https://charms.dev/_astro/logo-charms-dark.Ceshk2t3.png"
                                alt="Charms Wallet"
                                className="h-8"
                            />
                        </div>

                        {/* Blockchain and Network selection */}
                        <div className="flex items-center space-x-3">
                            {/* Blockchain selection buttons */}
                            <div className="flex space-x-2 mr-2">
                                <button
                                    className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getBlockchainClass(BLOCKCHAINS.BITCOIN)}`}
                                    onClick={() => handleBlockchainSelect(BLOCKCHAINS.BITCOIN)}
                                >
                                    Bitcoin
                                </button>
                                {/* Cardano button temporarily hidden */}
                                {/* <button
                                    className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getBlockchainClass(BLOCKCHAINS.CARDANO)}`}
                                    onClick={() => handleBlockchainSelect(BLOCKCHAINS.CARDANO)}
                                >
                                    Cardano
                                </button> */}
                            </div>

                            {/* Network dropdown */}
                            <div className="relative z-[99999]">
                                <button
                                    className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${isBitcoin() ? "bg-bitcoin-500/20 text-bitcoin-400" : "bg-cardano-500/20 text-cardano-400"
                                        }`}
                                    onClick={handleDropdownToggle}
                                >
                                    {getNetworkDisplayName()}
                                    <svg className="ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                                    </svg>
                                </button>


                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Navigation section */}
            <nav className="glass-effect border-b border-dark-700/50 relative z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex space-x-8">
                        <button
                            className={`py-4 px-1 inline-flex items-center border-b-2 ${activeSection === 'wallets'
                                ? 'border-primary-500 text-primary-400'
                                : 'border-transparent text-dark-300 hover:border-dark-500 hover:text-dark-200'
                                }`}
                            onClick={() => setActiveSection("wallets")}
                        >
                            Wallets
                        </button>
                        <button
                            className={`py-4 px-1 inline-flex items-center border-b-2 ${activeSection === 'addresses'
                                ? 'border-primary-500 text-primary-400'
                                : 'border-transparent text-dark-300 hover:border-dark-500 hover:text-dark-200'
                                }`}
                            onClick={() => setActiveSection("addresses")}
                        >
                            Addresses
                        </button>
                        <button
                            className={`py-4 px-1 inline-flex items-center border-b-2 ${activeSection === 'utxos'
                                ? 'border-primary-500 text-primary-400'
                                : 'border-transparent text-dark-300 hover:border-dark-500 hover:text-dark-200'
                                }`}
                            onClick={() => setActiveSection("utxos")}
                        >
                            UTXOs
                        </button>
                        <button
                            className={`py-4 px-1 inline-flex items-center border-b-2 ${activeSection === 'charms'
                                ? 'border-primary-500 text-primary-400'
                                : 'border-transparent text-dark-300 hover:border-dark-500 hover:text-dark-200'
                                }`}
                            onClick={() => setActiveSection("charms")}
                        >
                            Charms
                        </button>

                    </div>
                </div>
            </nav>

            {/* Portal-based dropdown */}
            {mounted && networkDropdownOpen && createPortal(
                React.createElement('div', {
                    className: 'fixed w-48 rounded-md shadow-lg bg-dark-800 ring-1 ring-black ring-opacity-5 dropdown-portal',
                    style: { top: `${dropdownPosition.top}px`, right: `${dropdownPosition.right}px` }
                },
                    React.createElement('div', { className: 'py-1', role: 'menu' },
                        availableNetworks.map((network) =>
                            React.createElement('button', {
                                key: network.id,
                                className: `block w-full text-left px-4 py-2 text-sm ${network.id === activeNetwork
                                    ? isBitcoin() ? 'text-bitcoin-400 bg-dark-700' : 'text-cardano-400 bg-dark-700'
                                    : 'text-dark-300 hover:bg-dark-700'
                                    }`,
                                onClick: () => handleNetworkSelect(network.id)
                            }, network.name)
                        )
                    )
                ),
                document.body
            )}
        </div>
    );
}
