import { useState } from 'react';

export default function Header({ activeSection, setActiveSection }) {
    return (
        <>
            {/* Header section */}
            <header className="bg-white shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex justify-between items-center">
                        {/* Logo section */}
                        <div className="flex items-center">
                            <img
                                src="https://charms.dev/_astro/logo-charms-dark.Ceshk2t3.png"
                                alt="Charms Logo"
                                className="h-8"
                            />
                            <span className="ml-2 text-xl font-semibold text-gray-900">Wallet</span>
                        </div>

                        {/* Network badge section */}
                        <div className="flex items-center">
                            <span
                                className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800"
                            >
                                Testnet4
                            </span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Navigation section */}
            <nav className="bg-white border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex space-x-8">
                        <button
                            className={`py-4 px-1 inline-flex items-center border-b-2 ${activeSection === 'wallets'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                                }`}
                            onClick={() => setActiveSection("wallets")}
                        >
                            Wallets
                        </button>
                        <button
                            className={`py-4 px-1 inline-flex items-center border-b-2 ${activeSection === 'addresses'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                                }`}
                            onClick={() => setActiveSection("addresses")}
                        >
                            Addresses
                        </button>
                        <button
                            className={`py-4 px-1 inline-flex items-center border-b-2 ${activeSection === 'utxos'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                                }`}
                            onClick={() => setActiveSection("utxos")}
                        >
                            UTXOs
                        </button>
                        <button
                            className={`py-4 px-1 inline-flex items-center border-b-2 ${activeSection === 'charms'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                                }`}
                            onClick={() => setActiveSection("charms")}
                        >
                            Charms
                        </button>
                        <button
                            className={`py-4 px-1 inline-flex items-center border-b-2 ${activeSection === 'settings'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                                }`}
                            onClick={() => setActiveSection("settings")}
                        >
                            Settings
                        </button>
                    </div>
                </div>
            </nav>
        </>
    );
}
