'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { BLOCKCHAINS } from '@/stores/blockchainStore';
import { useNetworkDropdown } from '@/hooks/useNetworkDropdown';
import { useBeamOperations } from '@/contexts/BeamOperationsContext';

export default function Header({ activeSection, setActiveSection }) {
    const {
        activeNetwork,
        mounted,
        networkDropdownOpen,
        dropdownPosition,
        availableNetworks,
        isBitcoin,
        handleBlockchainSelect,
        handleNetworkSelect,
        handleDropdownToggle,
        getNetworkDisplayName,
        getBlockchainClass,
    } = useNetworkDropdown();

    const { hasActiveOperations, togglePanel } = useBeamOperations();

    return (
        <div className="fixed-header">
            {/* Header section */}
            <header className="glass-effect">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-2">
                    {/* Desktop layout */}
                    <div className="hidden sm:flex justify-between items-center">
                        {/* Logo section */}
                        <div className="flex items-center space-x-6">
                            {/* Main Charms Logo */}
                            <div className="flex items-center space-x-3">
                                <Image
                                    src="/logo.png"
                                    alt="Charms Wallet"
                                    width={32}
                                    height={32}
                                    className="h-8 w-auto"
                                />
                                <span className="text-lg font-semibold text-dark-100 tracking-tight" style={{ transform: 'translateX(-3px)' }}>
                                    Charms Wallet
                                </span>
                            </div>
                            
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
                                <button
                                    className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getBlockchainClass(BLOCKCHAINS.CARDANO)}`}
                                    onClick={() => handleBlockchainSelect(BLOCKCHAINS.CARDANO)}
                                >
                                    Cardano
                                </button>
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

                            {/* Beam operations button */}
                            <button
                                className={`beam-ops-btn${hasActiveOperations ? ' beam-ops-btn--active' : ''}`}
                                onClick={togglePanel}
                                title="Beam Operations"
                            >
                                {hasActiveOperations && <span className="beam-ops-spinner-ring" />}
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Mobile layout */}
                    <div className="sm:hidden">
                        {/* Top row: Logo + Buttons */}
                        <div className="flex justify-between items-center">
                            {/* Smaller Charms Logo */}
                            <div className="flex items-center space-x-2">
                                <Image
                                    src="/logo.png"
                                    alt="Charms Wallet"
                                    width={24}
                                    height={24}
                                    className="h-6 w-auto"
                                />
                                <span className="text-sm font-semibold text-dark-100 tracking-tight" style={{ transform: 'translateX(-3px)' }}>
                                    Charms Wallet
                                </span>
                            </div>
                            
                            {/* Blockchain and Network selection */}
                            <div className="flex items-center space-x-2">
                                {/* Blockchain selection buttons */}
                                <div className="flex space-x-1">
                                    <button
                                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getBlockchainClass(BLOCKCHAINS.BITCOIN)}`}
                                        onClick={() => handleBlockchainSelect(BLOCKCHAINS.BITCOIN)}
                                    >
                                        Bitcoin
                                    </button>
                                </div>

                                {/* Network dropdown */}
                                <div className="relative z-[99999]">
                                    <button
                                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${isBitcoin() ? "bg-bitcoin-500/20 text-bitcoin-400" : "bg-cardano-500/20 text-cardano-400"
                                            }`}
                                        onClick={handleDropdownToggle}
                                    >
                                        {getNetworkDisplayName()}
                                        <svg className="ml-1 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                    </div>
                </div>
            </header>

            {/* Navigation section */}
            <nav className="glass-effect border-b border-dark-700/50 relative z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    {/* Desktop navigation */}
                    <div className="hidden sm:flex space-x-8">
                        <button
                            className={`px-1 inline-flex items-center border-b-2 ${activeSection === 'wallets'
                                ? 'border-primary-500 text-primary-400'
                                : 'border-transparent text-dark-300 hover:border-dark-500 hover:text-dark-200'
                                }`}
                            style={{paddingTop: '6px', paddingBottom: '6px'}}
                            onClick={() => setActiveSection("wallets")}
                        >
                            Wallets
                        </button>
                        <button
                            className={`px-1 inline-flex items-center border-b-2 ${activeSection === 'history'
                                ? 'border-primary-500 text-primary-400'
                                : 'border-transparent text-dark-300 hover:border-dark-500 hover:text-dark-200'
                                }`}
                            style={{paddingTop: '6px', paddingBottom: '6px'}}
                            onClick={() => setActiveSection("history")}
                        >
                            History
                        </button>
                        <button
                            className={`px-1 inline-flex items-center border-b-2 ${activeSection === 'addresses'
                                ? 'border-primary-500 text-primary-400'
                                : 'border-transparent text-dark-300 hover:border-dark-500 hover:text-dark-200'
                                }`}
                            style={{paddingTop: '6px', paddingBottom: '6px'}}
                            onClick={() => setActiveSection("addresses")}
                        >
                            Addresses
                        </button>
                        <button
                            className={`px-1 inline-flex items-center border-b-2 ${activeSection === 'utxos'
                                ? 'border-primary-500 text-primary-400'
                                : 'border-transparent text-dark-300 hover:border-dark-500 hover:text-dark-200'
                                }`}
                            style={{paddingTop: '6px', paddingBottom: '6px'}}
                            onClick={() => setActiveSection("utxos")}
                        >
                            UTXOs
                        </button>
                        <button
                            className={`px-1 inline-flex items-center border-b-2 ${activeSection === 'charms'
                                ? 'border-primary-500 text-primary-400'
                                : 'border-transparent text-dark-300 hover:border-dark-500 hover:text-dark-200'
                                }`}
                            style={{paddingTop: '6px', paddingBottom: '6px'}}
                            onClick={() => setActiveSection("charms")}
                        >
                            {isBitcoin() ? 'Charms' : 'Assets'}
                        </button>
                    </div>

                    {/* Mobile navigation - reduced height */}
                    <div className="sm:hidden flex space-x-4 overflow-x-auto">
                        <button
                            className={`py-2 px-1 inline-flex items-center border-b-2 text-sm whitespace-nowrap ${activeSection === 'wallets'
                                ? 'border-primary-500 text-primary-400'
                                : 'border-transparent text-dark-300 hover:border-dark-500 hover:text-dark-200'
                                }`}
                            onClick={() => setActiveSection("wallets")}
                        >
                            Wallets
                        </button>
                        <button
                            className={`py-2 px-1 inline-flex items-center border-b-2 text-sm whitespace-nowrap ${activeSection === 'history'
                                ? 'border-primary-500 text-primary-400'
                                : 'border-transparent text-dark-300 hover:border-dark-500 hover:text-dark-200'
                                }`}
                            onClick={() => setActiveSection("history")}
                        >
                            History
                        </button>
                        <button
                            className={`py-2 px-1 inline-flex items-center border-b-2 text-sm whitespace-nowrap ${activeSection === 'addresses'
                                ? 'border-primary-500 text-primary-400'
                                : 'border-transparent text-dark-300 hover:border-dark-500 hover:text-dark-200'
                                }`}
                            onClick={() => setActiveSection("addresses")}
                        >
                            Addresses
                        </button>
                        <button
                            className={`py-2 px-1 inline-flex items-center border-b-2 text-sm whitespace-nowrap ${activeSection === 'utxos'
                                ? 'border-primary-500 text-primary-400'
                                : 'border-transparent text-dark-300 hover:border-dark-500 hover:text-dark-200'
                                }`}
                            onClick={() => setActiveSection("utxos")}
                        >
                            UTXOs
                        </button>
                        <button
                            className={`py-2 px-1 inline-flex items-center border-b-2 text-sm whitespace-nowrap ${activeSection === 'charms'
                                ? 'border-primary-500 text-primary-400'
                                : 'border-transparent text-dark-300 hover:border-dark-500 hover:text-dark-200'
                                }`}
                            onClick={() => setActiveSection("charms")}
                        >
                            {isBitcoin() ? 'Charms' : 'Assets'}
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
