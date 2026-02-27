import { formatBTC } from '@/utils/formatters';

export default function BalanceCards({ totalBalance, pendingBalance, broBalance, isSyncing, syncPhase }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-r from-bitcoin-500 to-orange-600 flex items-center justify-center">
            <span className="text-xs font-bold text-white">₿</span>
          </div>
          <span className="text-xs text-dark-400">Bitcoin</span>
        </div>
        <div className="text-xl font-bold gradient-text">
          {isSyncing && syncPhase === 'utxos' ? '--' : formatBTC(totalBalance)}
        </div>
        <div className="text-xs text-dark-500">BTC</div>
        {pendingBalance > 0 && (
          <div className="text-xs text-orange-400 mt-1">
            +{formatBTC(pendingBalance)} pending
          </div>
        )}
      </div>

      <div className="card p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-full overflow-hidden">
            <img
              src="https://bro.charms.dev/assets/bro-token-DsXLIv23.jpg"
              alt="BRO"
              className="w-full h-full object-cover"
            />
          </div>
          <span className="text-xs text-dark-400">Bro Token</span>
        </div>
        <div className="text-xl font-bold text-bitcoin-400">
          {isSyncing ? '--' : Number(broBalance || 0).toFixed(2)}
        </div>
        {isSyncing && syncPhase === 'charms' && (
          <div className="text-[10px] text-bitcoin-400/60 mt-0.5">updating...</div>
        )}
        <div className="text-xs text-dark-500">$BRO</div>
      </div>
    </div>
  );
}
