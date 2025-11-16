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
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-2">
                    {/* Desktop layout */}
                    <div className="hidden sm:flex justify-between items-center">
                        {/* Logo section */}
                        <div className="flex items-center space-x-6">
                            {/* Main Charms Logo */}
                            <img
                                src="https://charms.dev/_astro/logo-charms-dark.Ceshk2t3.png"
                                alt="Charms Wallet"
                                className="h-8"
                            />
                            
                            {/* "Designed for" text with BOS logo */}
                            <a href="https://bitcoinos.build/" target="_blank" rel="noopener noreferrer" className="flex items-center hover:opacity-80 transition-opacity">
                                <span className="text-sm text-dark-400 whitespace-nowrap" style={{transform: 'translateY(5px)'}}>Designed for</span>
                                <svg width="81" height="46" viewBox="0 0 680 386" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-90" style={{transform: 'translateY(8px)', marginLeft: '-13px'}}>
                                    <rect width="680" height="344" rx="4" fill="transparent"/>
                                    <g clipPath="url(#clip0_4151_367)">
                                        <path d="M225.332 171.914C225.148 171.253 224.673 170.751 224.067 170.486C223.803 170.381 223.513 170.328 223.25 170.328C222.881 170.328 222.512 170.434 222.169 170.619L219.216 172.337C217.529 173.315 216.475 175.139 216.475 177.096V224.233C216.475 224.973 216.844 225.634 217.503 226.005C218.135 226.375 218.926 226.375 219.559 226.005L234.823 217.175C236.431 216.249 237.222 214.319 236.721 212.522L225.359 171.94L225.332 171.914Z" fill="#FFFAFA"/>
                                        <path d="M191.403 161.551L169.337 148.781C169.021 148.596 168.652 148.517 168.309 148.517C167.967 148.517 167.597 148.623 167.281 148.808C166.648 149.178 166.253 149.839 166.253 150.579V197.717C166.253 199.673 167.308 201.497 168.995 202.475L171.341 203.824C172.053 204.247 172.896 204.326 173.714 204.088C174.531 203.85 175.137 203.295 175.506 202.528L192.774 166.045C193.538 164.432 192.932 162.476 191.376 161.577L191.403 161.551Z" fill="#FFFAFA"/>
                                        <path d="M210.016 172.337L200.13 166.6C199.418 166.177 198.575 166.098 197.757 166.336C196.966 166.574 196.334 167.129 195.965 167.896L178.697 204.379C177.933 205.992 178.539 207.948 180.094 208.847L209.7 225.978C210.332 226.348 211.097 226.348 211.756 225.978C212.389 225.608 212.784 224.947 212.784 224.207V177.069C212.784 175.113 211.729 173.289 210.042 172.311L210.016 172.337Z" fill="#FFFAFA"/>
                                        <path d="M259.076 143.785C259.076 143.045 258.681 142.384 258.048 142.014L250.983 137.942C249.797 137.255 248.452 136.911 247.108 136.911C246.449 136.911 245.816 136.991 245.157 137.149L187.581 152.007C186.816 152.192 186.5 152.8 186.421 153.329C186.342 153.831 186.526 154.518 187.186 154.889L211.834 169.165C213.522 170.143 215.631 170.143 217.318 169.165L258.022 145.609C258.654 145.239 259.05 144.578 259.05 143.838L259.076 143.785Z" fill="#FFFAFA"/>
                                        <path d="M261.95 148.782C261.634 148.596 261.265 148.491 260.922 148.491C260.579 148.491 260.21 148.596 259.894 148.755L230.605 165.701C228.997 166.627 228.206 168.557 228.707 170.354L240.069 210.935C240.254 211.596 240.728 212.099 241.335 212.363C241.967 212.601 242.653 212.574 243.233 212.231L260.184 202.423C261.871 201.444 262.926 199.62 262.926 197.664V150.553C262.926 149.813 262.53 149.152 261.897 148.782H261.95Z" fill="#FFFAFA"/>
                                        <path d="M171.184 145.583L176.588 148.729C178.354 149.76 180.41 150.024 182.388 149.522L239.963 134.664C240.702 134.479 241.044 133.871 241.123 133.369C241.202 132.866 241.018 132.179 240.359 131.809L217.344 118.458C216.501 117.956 215.552 117.718 214.603 117.718C213.654 117.718 212.705 117.956 211.861 118.458L171.184 142.014C170.551 142.384 170.155 143.045 170.155 143.785C170.155 144.525 170.524 145.186 171.184 145.556V145.583Z" fill="#FFFAFA"/>
                                    </g>
                                    <path d="M341.906 209.434H299.182V134.567H342.405C353.785 134.567 362.27 139.358 362.27 152.235V155.629C362.27 164.513 356.48 168.806 350.89 169.904C357.678 170.702 364.965 174.595 364.965 186.674V190.567C364.965 204.542 354.484 209.434 341.906 209.434ZM331.026 148.142H321.243V164.913H331.026C337.913 164.913 340.808 161.918 340.808 156.627C340.808 151.137 337.913 148.142 331.026 148.142ZM332.523 178.289H321.243V195.558H332.523C339.411 195.558 342.705 192.863 342.705 186.874C342.705 180.884 339.411 178.289 332.523 178.289Z" fill="#FFFAFA"/>
                                    <path d="M442.995 176.292C442.995 199.751 431.415 210.332 413.447 210.332H399.173C381.205 210.332 369.625 199.751 369.625 176.292V167.708C369.625 144.249 381.205 133.668 399.173 133.668H413.447C431.415 133.668 442.995 144.249 442.995 167.708V176.292ZM392.784 172.1C392.784 188.471 396.178 196.556 406.36 196.556C416.442 196.556 419.836 188.471 419.836 172.1C419.836 155.729 416.442 147.444 406.36 147.444C396.178 147.444 392.784 155.729 392.784 172.1Z" fill="#FFFAFA"/>
                                    <path d="M487.034 133.568C505.901 133.568 511.391 141.953 511.391 153.034V156.927H488.831V156.328C488.831 150.139 486.136 145.847 479.348 145.847C473.758 145.847 470.863 148.542 470.863 152.934C470.863 156.927 473.658 159.023 478.25 160.121C479.348 160.421 491.127 163.315 492.325 163.615C510.393 168.007 513.388 175.693 513.388 186.674V189.369C513.388 201.148 506.101 210.532 488.831 210.532H473.958C452.496 210.532 446.606 201.747 446.606 188.371V186.075H469.965V186.674C469.965 192.264 472.161 198.054 481.245 198.054C487.234 198.054 490.129 195.159 490.129 190.867C490.129 186.874 488.332 184.578 482.443 183.18C481.345 182.881 469.466 179.986 468.368 179.686C451.298 175.394 447.904 167.109 447.904 156.528V154.132C447.904 141.953 455.69 133.568 472.261 133.568H487.034Z" fill="#FFFAFA"/>
                                    <defs>
                                        <clipPath id="clip0_4151_367">
                                            <rect width="96.7241" height="110" fill="white" transform="translate(166.483 117)"/>
                                        </clipPath>
                                    </defs>
                                </svg>
                            </a>
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

                    {/* Mobile layout */}
                    <div className="sm:hidden">
                        {/* Top row: Logo + Buttons */}
                        <div className="flex justify-between items-center">
                            {/* Smaller Charms Logo */}
                            <img
                                src="https://charms.dev/_astro/logo-charms-dark.Ceshk2t3.png"
                                alt="Charms Wallet"
                                className="h-6"
                            />
                            
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
                        
                        {/* Bottom row: Designed for BOS - aligned left and closer */}
                        <div className="flex justify-start" style={{marginTop: '-6px', marginBottom: '-10px'}}>
                            <a href="https://bitcoinos.build/" target="_blank" rel="noopener noreferrer" className="flex items-center hover:opacity-80 transition-opacity">
                                <span className="text-xs text-dark-400 whitespace-nowrap" style={{transform: 'translateY(2px)'}}>Designed for</span>
                                <svg width="60" height="34" viewBox="0 0 680 386" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-90" style={{transform: 'translateY(3px)', marginLeft: '-8px'}}>
                                    <rect width="680" height="344" rx="4" fill="transparent"/>
                                    <g clipPath="url(#clip0_4151_367)">
                                        <path d="M225.332 171.914C225.148 171.253 224.673 170.751 224.067 170.486C223.803 170.381 223.513 170.328 223.25 170.328C222.881 170.328 222.512 170.434 222.169 170.619L219.216 172.337C217.529 173.315 216.475 175.139 216.475 177.096V224.233C216.475 224.973 216.844 225.634 217.503 226.005C218.135 226.375 218.926 226.375 219.559 226.005L234.823 217.175C236.431 216.249 237.222 214.319 236.721 212.522L225.359 171.94L225.332 171.914Z" fill="#FFFAFA"/>
                                        <path d="M191.403 161.551L169.337 148.781C169.021 148.596 168.652 148.517 168.309 148.517C167.967 148.517 167.597 148.623 167.281 148.808C166.648 149.178 166.253 149.839 166.253 150.579V197.717C166.253 199.673 167.308 201.497 168.995 202.475L171.341 203.824C172.053 204.247 172.896 204.326 173.714 204.088C174.531 203.85 175.137 203.295 175.506 202.528L192.774 166.045C193.538 164.432 192.932 162.476 191.376 161.577L191.403 161.551Z" fill="#FFFAFA"/>
                                        <path d="M210.016 172.337L200.13 166.6C199.418 166.177 198.575 166.098 197.757 166.336C196.966 166.574 196.334 167.129 195.965 167.896L178.697 204.379C177.933 205.992 178.539 207.948 180.094 208.847L209.7 225.978C210.332 226.348 211.097 226.348 211.756 225.978C212.389 225.608 212.784 224.947 212.784 224.207V177.069C212.784 175.113 211.729 173.289 210.042 172.311L210.016 172.337Z" fill="#FFFAFA"/>
                                        <path d="M259.076 143.785C259.076 143.045 258.681 142.384 258.048 142.014L250.983 137.942C249.797 137.255 248.452 136.911 247.108 136.911C246.449 136.911 245.816 136.991 245.157 137.149L187.581 152.007C186.816 152.192 186.5 152.8 186.421 153.329C186.342 153.831 186.526 154.518 187.186 154.889L211.834 169.165C213.522 170.143 215.631 170.143 217.318 169.165L258.022 145.609C258.654 145.239 259.05 144.578 259.05 143.838L259.076 143.785Z" fill="#FFFAFA"/>
                                        <path d="M261.95 148.782C261.634 148.596 261.265 148.491 260.922 148.491C260.579 148.491 260.21 148.596 259.894 148.755L230.605 165.701C228.997 166.627 228.206 168.557 228.707 170.354L240.069 210.935C240.254 211.596 240.728 212.099 241.335 212.363C241.967 212.601 242.653 212.574 243.233 212.231L260.184 202.423C261.871 201.444 262.926 199.62 262.926 197.664V150.553C262.926 149.813 262.53 149.152 261.897 148.782H261.95Z" fill="#FFFAFA"/>
                                        <path d="M171.184 145.583L176.588 148.729C178.354 149.76 180.41 150.024 182.388 149.522L239.963 134.664C240.702 134.479 241.044 133.871 241.123 133.369C241.202 132.866 241.018 132.179 240.359 131.809L217.344 118.458C216.501 117.956 215.552 117.718 214.603 117.718C213.654 117.718 212.705 117.956 211.861 118.458L171.184 142.014C170.551 142.384 170.155 143.045 170.155 143.785C170.155 144.525 170.524 145.186 171.184 145.556V145.583Z" fill="#FFFAFA"/>
                                    </g>
                                    <path d="M341.906 209.434H299.182V134.567H342.405C353.785 134.567 362.27 139.358 362.27 152.235V155.629C362.27 164.513 356.48 168.806 350.89 169.904C357.678 170.702 364.965 174.595 364.965 186.674V190.567C364.965 204.542 354.484 209.434 341.906 209.434ZM331.026 148.142H321.243V164.913H331.026C337.913 164.913 340.808 161.918 340.808 156.627C340.808 151.137 337.913 148.142 331.026 148.142ZM332.523 178.289H321.243V195.558H332.523C339.411 195.558 342.705 192.863 342.705 186.874C342.705 180.884 339.411 178.289 332.523 178.289Z" fill="#FFFAFA"/>
                                    <path d="M442.995 176.292C442.995 199.751 431.415 210.332 413.447 210.332H399.173C381.205 210.332 369.625 199.751 369.625 176.292V167.708C369.625 144.249 381.205 133.668 399.173 133.668H413.447C431.415 133.668 442.995 144.249 442.995 167.708V176.292ZM392.784 172.1C392.784 188.471 396.178 196.556 406.36 196.556C416.442 196.556 419.836 188.471 419.836 172.1C419.836 155.729 416.442 147.444 406.36 147.444C396.178 147.444 392.784 155.729 392.784 172.1Z" fill="#FFFAFA"/>
                                    <path d="M487.034 133.568C505.901 133.568 511.391 141.953 511.391 153.034V156.927H488.831V156.328C488.831 150.139 486.136 145.847 479.348 145.847C473.758 145.847 470.863 148.542 470.863 152.934C470.863 156.927 473.658 159.023 478.25 160.121C479.348 160.421 491.127 163.315 492.325 163.615C510.393 168.007 513.388 175.693 513.388 186.674V189.369C513.388 201.148 506.101 210.532 488.831 210.532H473.958C452.496 210.532 446.606 201.747 446.606 188.371V186.075H469.965V186.674C469.965 192.264 472.161 198.054 481.245 198.054C487.234 198.054 490.129 195.159 490.129 190.867C490.129 186.874 488.332 184.578 482.443 183.18C481.345 182.881 469.466 179.986 468.368 179.686C451.298 175.394 447.904 167.109 447.904 156.528V154.132C447.904 141.953 455.69 133.568 472.261 133.568H487.034Z" fill="#FFFAFA"/>
                                    <defs>
                                        <clipPath id="clip0_4151_367">
                                            <rect width="96.7241" height="110" fill="white" transform="translate(166.483 117)"/>
                                        </clipPath>
                                    </defs>
                                </svg>
                            </a>
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
                            Charms
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
