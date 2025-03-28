'use client';

import { useState } from 'react';
import Header from './Header';
import Footer from './Footer';
import AddressManager from '@/components/wallet/addresses/AddressManager';
import UTXOList from '@/components/wallet/utxos/UTXOList';
import CharmsList from '@/components/wallet/charms/CharmsList';

export default function MainLayout({ children }) {
    const [activeSection, setActiveSection] = useState('wallets');

    return (
        <div className="min-h-screen flex flex-col bg-gray-50 relative">
            <Header activeSection={activeSection} setActiveSection={setActiveSection} />

            {/* Main content section */}
            <main className="flex-grow py-8">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    {/* Wallet section */}
                    <div
                        className={`transition-opacity duration-200 ${activeSection !== "wallets" ? "opacity-0 hidden" : ""
                            }`}
                    >
                        {children}
                    </div>

                    {/* Addresses section */}
                    <div
                        className={`transition-opacity duration-200 ${activeSection !== "addresses" ? "opacity-0 hidden" : ""
                            }`}
                    >
                        <AddressManager />
                    </div>

                    {/* UTXOs section */}
                    <div
                        className={`transition-opacity duration-200 ${activeSection !== "utxos" ? "opacity-0 hidden" : ""
                            }`}
                    >
                        <UTXOList />
                    </div>

                    {/* Charms section */}
                    <div
                        className={`transition-opacity duration-200 ${activeSection !== "charms" ? "opacity-0 hidden" : ""
                            }`}
                    >
                        <h1 className="text-2xl font-bold mb-4">Charms</h1>
                        <CharmsList />
                    </div>

                    {/* Settings section */}
                    <div
                        className={`transition-opacity duration-200 ${activeSection !== "settings" ? "opacity-0 hidden" : ""
                            }`}
                    >
                        <h1 className="text-2xl font-bold mb-4">Settings</h1>
                        <p>Settings section content will go here.</p>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
}
