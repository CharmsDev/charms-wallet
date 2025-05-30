'use client';

import { useState, Suspense, lazy } from 'react';
import Header from './Header';
import Footer from './Footer';
import UTXOList from '@/components/wallet/utxos/UTXOList';
import CharmsList from '@/components/wallet/charms/CharmsList';

// Dynamically import components that use WebAssembly
const AddressManager = lazy(() => import('@/components/wallet/addresses/AddressManager'));

export default function MainLayout({ children }) {
    const [activeSection, setActiveSection] = useState('wallets');

    return (
        <div className="min-h-screen flex flex-col bg-dark-950 relative">
            <Header activeSection={activeSection} setActiveSection={setActiveSection} />

            {/* Main content section - added pt-32 to account for fixed header */}
            <main className="flex-grow py-8 pt-32">
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
                        <Suspense fallback={<div>Loading address manager...</div>}>
                            <AddressManager />
                        </Suspense>
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
                        <CharmsList />
                    </div>

                    {/* Settings section */}
                    <div
                        className={`transition-opacity duration-200 ${activeSection !== "settings" ? "opacity-0 hidden" : ""
                            }`}
                    >
                        <div className="p-6 flex justify-between items-center">
                            <h2 className="text-xl font-bold gradient-text">Settings</h2>
                        </div>
                        <div className="card p-6">
                            <p>Settings section content will go here.</p>
                        </div>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
}
