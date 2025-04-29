export default function Header({ activeSection, setActiveSection }) {

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
                                alt="Charms Logo"
                                className="h-8"
                            />
                            <span className="ml-2 text-xl font-bold tracking-tight gradient-text">Wallet</span>
                        </div>

                        {/* Network badge section */}
                        <div className="flex items-center space-x-3">
                            <span
                                className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-bitcoin-500/20 text-bitcoin-400 bitcoin-glow-text"
                            >
                                Testnet4
                            </span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Navigation section */}
            <nav className="glass-effect border-b border-dark-700/50">
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
                        <button
                            className={`py-4 px-1 inline-flex items-center border-b-2 ${activeSection === 'settings'
                                ? 'border-primary-500 text-primary-400'
                                : 'border-transparent text-dark-300 hover:border-dark-500 hover:text-dark-200'
                                }`}
                            onClick={() => setActiveSection("settings")}
                        >
                            Settings
                        </button>
                    </div>
                </div>
            </nav>
        </div>
    );
}
