export default function DashboardHeader({ activeNetwork, networkLabel, isSyncing, syncPhase, lastSynced, onSync }) {
  return (
    <header className="glass-effect flex items-center justify-between px-4 py-3 border-b border-dark-700">
      <div className="flex items-center gap-2">
        <img src="./logo.png" alt="Charms" className="w-8 h-8 object-contain" />
        <span className="font-semibold gradient-text">Charms Wallet</span>
      </div>

      <div className="flex items-center gap-2">
        <div className={`flex items-center gap-1 px-2 py-1 rounded-full border ${
          activeNetwork === 'mainnet'
            ? 'bg-orange-900/30 border-orange-600/50'
            : 'bg-dark-800 border-dark-600'
        }`}>
          <div className={`w-1.5 h-1.5 rounded-full ${activeNetwork === 'mainnet' ? 'bg-orange-500' : 'bg-green-500'}`} />
          <span className={`text-xs ${activeNetwork === 'mainnet' ? 'text-orange-400' : 'text-dark-400'}`}>
            {networkLabel}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {isSyncing && (
            <span className="text-[10px] text-dark-400 whitespace-nowrap">
              {syncPhase === 'utxos' ? 'BTC...' : syncPhase === 'charms' ? '$BRO...' : ''}
            </span>
          )}
          <button
            onClick={onSync}
            disabled={isSyncing}
            className="p-2 rounded-lg glass-effect hover:bg-dark-700 transition-colors"
            title={lastSynced ? `Last synced: ${lastSynced.toLocaleTimeString()}` : 'Sync wallet'}
          >
            <svg
              className={`w-5 h-5 text-dark-300 ${isSyncing ? 'animate-spin' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
