'use client';

export default function AddressControls({
    onGenerateAddress,
    isCardano,
    addressType,
    onToggleAddressType,
    bitcoinAddressTab,
    onBitcoinAddressTabChange,
    filter,
    onFilterChange,
    canGenerateMore,
    isGenerating,
    generationProgress
}) {
    return (
        <div className="p-4 sm:p-6 flex flex-wrap items-center justify-between gap-2">
            <h2 className="hidden md:block text-xl font-bold gradient-text">Your Addresses</h2>
            <div className="flex items-center flex-wrap gap-2 sm:gap-3">
                {!isCardano && (
                    <>
                        {/* SegWit (primary) / Taproot tabs */}
                        <div className="flex items-center gap-1 bg-gray-800 rounded-full p-1">
                            <button
                                onClick={() => onBitcoinAddressTabChange('segwit')}
                                className={`px-3 py-1 text-sm font-medium rounded-full whitespace-nowrap inline-flex items-center gap-1.5 ${bitcoinAddressTab === 'segwit' ? 'bg-bitcoin-500 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                            >
                                Native SegWit
                                <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${bitcoinAddressTab === 'segwit' ? 'bg-white/20 text-white' : 'bg-bitcoin-500/20 text-bitcoin-400'}`}>
                                    Main
                                </span>
                            </button>
                            <button
                                onClick={() => onBitcoinAddressTabChange('taproot')}
                                className={`px-3 py-1 text-sm font-medium rounded-full whitespace-nowrap ${bitcoinAddressTab === 'taproot' ? 'bg-bitcoin-500 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                            >
                                Taproot
                            </button>
                        </div>

                        {/* All / In Use filter */}
                        <div className="flex items-center gap-1 bg-gray-800 rounded-full p-1">
                            <button
                                onClick={() => onFilterChange('all')}
                                className={`px-3 py-1 text-sm font-medium rounded-full whitespace-nowrap ${filter === 'all' ? 'bg-blue-500 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                            >
                                All
                            </button>
                            <button
                                onClick={() => onFilterChange('in-use')}
                                className={`px-3 py-1 text-sm font-medium rounded-full whitespace-nowrap ${filter === 'in-use' ? 'bg-blue-500 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                            >
                                In Use
                            </button>
                        </div>
                    </>
                )}
                {isCardano && (
                    <div className="flex items-center">
                        <span className="text-sm text-dark-300 mr-2">Address Type:</span>
                        <button
                            onClick={onToggleAddressType}
                            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${addressType === 'payment'
                                ? "bg-cardano-500/20 text-cardano-400 cardano-glow-text"
                                : "bg-dark-700/30 text-dark-400 hover:bg-dark-700/50"
                                }`}
                        >
                            Payment
                        </button>
                        <button
                            onClick={onToggleAddressType}
                            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ml-2 ${addressType === 'staking'
                                ? "bg-cardano-500/20 text-cardano-400 cardano-glow-text"
                                : "bg-dark-700/30 text-dark-400 hover:bg-dark-700/50"
                                }`}
                        >
                            Staking
                        </button>
                    </div>
                )}
                <button
                    onClick={onGenerateAddress}
                    className={`btn ${isCardano ? 'btn-cardano' : 'btn-primary'} ${!canGenerateMore || isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
                    disabled={!canGenerateMore || isGenerating}
                >
                    {isGenerating ? (
                        <div className="flex items-center space-x-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            <span>Generating...</span>
                        </div>
                    ) : (
                        <>
                            <span className="hidden sm:inline">Generate New Address</span>
                            <span className="sm:hidden">Create New</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
