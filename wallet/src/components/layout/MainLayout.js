'use client';

import { Suspense, lazy } from 'react';
import Header from './Header';
import Footer from './Footer';
import BeamPanel from '@/components/beam/BeamPanel';
import { useNavigation } from '@/contexts/NavigationContext';
import { useBlockchain } from '@/stores/blockchainStore';

// Import AddressManager and UTXOList directly for instant loading, lazy load others
import AddressManager from '@/components/wallet/addresses/AddressManager';
import UTXOList from '@/components/wallet/utxos/UTXOList';
import TransactionHistory from '@/components/wallet/history/TransactionHistory';
import ExtensionInstallGuide from '@/components/extension/ExtensionInstallGuide';
import CardanoTransactionHistory from '@/components/wallet/cardano/CardanoTransactionHistory';
import CardanoUTXOList from '@/components/wallet/cardano/CardanoUTXOList';
const CharmsList = lazy(() => import('@/components/wallet/charms/CharmsList'));
const CardanoAssetView = lazy(() => import('@/components/wallet/cardano/CardanoAssetView'));

export default function MainLayout({ children }) {
    const { activeSection, setActiveSection, loadedSections } = useNavigation();
    const { isCardano } = useBlockchain();

    return (
        <div className="min-h-screen flex flex-col bg-dark-950 relative">
            <Header activeSection={activeSection} setActiveSection={setActiveSection} />

            {/* Main content section - responsive padding for fixed header */}
            <main className="flex-grow py-8 pt-28 sm:pt-20">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    {/* Wallet section */}
                    <div
                        className={`pt-6 transition-opacity duration-200 ${activeSection !== "wallets" ? "opacity-0 hidden" : ""
                            }`}
                    >
                        {children}
                    </div>

                    {/* History section - chain-aware */}
                    {loadedSections.has('history') && (
                        <div
                            className={`pt-6 transition-opacity duration-200 ${activeSection !== "history" ? "opacity-0 hidden" : ""
                                }`}
                        >
                            {isCardano() ? <CardanoTransactionHistory /> : <TransactionHistory />}
                        </div>
                    )}

                    {/* Addresses section - instant loading */}
                    {loadedSections.has('addresses') && (
                        <div
                            className={`pt-6 transition-opacity duration-200 ${activeSection !== "addresses" ? "opacity-0 hidden" : ""
                                }`}
                        >
                            <AddressManager />
                        </div>
                    )}

                    {/* UTXOs section - instant loading, chain-aware */}
                    {loadedSections.has('utxos') && (
                        <div
                            className={`pt-6 transition-opacity duration-200 ${activeSection !== "utxos" ? "opacity-0 hidden" : ""
                                }`}
                        >
                            {isCardano() ? <CardanoUTXOList /> : <UTXOList />}
                        </div>
                    )}

                    {/* Charms / Assets section - lazy loaded, chain-aware */}
                    {loadedSections.has('charms') && (
                        <div
                            className={`pt-6 transition-opacity duration-200 ${activeSection !== "charms" ? "opacity-0 hidden" : ""
                                }`}
                        >
                            <Suspense fallback={<div className="card p-6">Loading assets...</div>}>
                                {isCardano() ? <CardanoAssetView /> : <CharmsList />}
                            </Suspense>
                        </div>
                    )}

                    {/* Extension Install Guide */}
                    {loadedSections.has('extension-install') && (
                        <div
                            className={`pt-6 transition-opacity duration-200 ${activeSection !== "extension-install" ? "opacity-0 hidden" : ""
                                }`}
                        >
                            <ExtensionInstallGuide />
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
            <BeamPanel />
        </div>
    );
}
