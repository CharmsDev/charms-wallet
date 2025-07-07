'use client';

export default function AddressControls({
    onGenerateAddress,
    isCardano,
    addressType,
    onToggleAddressType,
    filter,
    onFilterChange,
    canGenerateMore,
    isGenerating,
    generationProgress
}) {
    return (
        <div className="p-6 flex justify-between items-center">
            <h2 className="text-xl font-bold gradient-text">Your Addresses</h2>
            <div className="flex items-center space-x-4">
                {!isCardano && (
                    <div className="flex items-center space-x-2 bg-gray-800 rounded-full p-1">
                        <button
                            onClick={() => onFilterChange('all')}
                            className={`px-3 py-1 text-sm font-medium rounded-full ${filter === 'all' ? 'bg-blue-500 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                        >
                            All
                        </button>
                        <button
                            onClick={() => onFilterChange('in-use')}
                            className={`px-3 py-1 text-sm font-medium rounded-full ${filter === 'in-use' ? 'bg-blue-500 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                        >
                            In Use
                        </button>
                    </div>
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
                        'Generate New Address'
                    )}
                </button>
            </div>
        </div>
    );
}
