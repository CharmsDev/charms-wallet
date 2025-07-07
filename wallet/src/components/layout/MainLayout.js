'use client';

import { useState, Suspense, lazy } from 'react';
import Header from './Header';
import Footer from './Footer';

// Import AddressManager and UTXOList directly for instant loading, lazy load others
import AddressManager from '@/components/wallet/addresses/AddressManager';
import UTXOList from '@/components/wallet/utxos/UTXOList';
const CharmsList = lazy(() => import('@/components/wallet/charms/CharmsList'));

export default function MainLayout({ children }) {
    const [activeSection, setActiveSection] = useState('wallets');
    const [loadedSections, setLoadedSections] = useState(new Set(['wallets']));

    // Track which sections have been loaded
    const handleSectionChange = (section) => {
        setActiveSection(section);
        setLoadedSections(prev => new Set([...prev, section]));
    };

    return (
        <div className="min-h-screen flex flex-col bg-dark-950 relative">
            <Header activeSection={activeSection} setActiveSection={handleSectionChange} />

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

                    {/* Addresses section - instant loading */}
                    {loadedSections.has('addresses') && (
                        <div
                            className={`transition-opacity duration-200 ${activeSection !== "addresses" ? "opacity-0 hidden" : ""
                                }`}
                        >
                            <AddressManager />
                        </div>
                    )}

                    {/* UTXOs section - instant loading */}
                    {loadedSections.has('utxos') && (
                        <div
                            className={`transition-opacity duration-200 ${activeSection !== "utxos" ? "opacity-0 hidden" : ""
                                }`}
                        >
                            <UTXOList />
                        </div>
                    )}

                    {/* Charms section - lazy loaded */}
                    {loadedSections.has('charms') && (
                        <div
                            className={`transition-opacity duration-200 ${activeSection !== "charms" ? "opacity-0 hidden" : ""
                                }`}
                        >
                            <Suspense fallback={<div className="card p-6">Loading charms...</div>}>
                                <CharmsList />
                            </Suspense>
                        </div>
                    )}

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
