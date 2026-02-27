import { useState, useCallback } from 'react';
import { getSeedPhrase, clearAllWalletData } from '@/services/storage';

function SeedPhraseSection() {
  const [visible, setVisible] = useState(false);
  const [words, setWords] = useState([]);
  const [copied, setCopied] = useState(false);

  const reveal = useCallback(async () => {
    const sp = await getSeedPhrase();
    if (sp) { setWords(sp.trim().split(/\s+/)); setVisible(true); }
  }, []);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(words.join(' '));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [words]);

  if (!visible) {
    return (
      <button
        onClick={reveal}
        className="w-full card p-4 flex items-center justify-between hover:border-primary-500/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center">
            <span className="text-sm">🔐</span>
          </div>
          <span className="text-sm text-white">Export Seed Phrase</span>
        </div>
        <span className="text-dark-500">→</span>
      </button>
    );
  }

  return (
    <div className="card p-4 border-yellow-500/30 bg-yellow-900/10">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-yellow-400">⚠️ Keep this secret</span>
        <button onClick={() => { setVisible(false); setCopied(false); }} className="text-xs text-dark-400 hover:text-white">Hide</button>
      </div>
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        {words.map((word, i) => (
          <div key={i} className="bg-dark-800 rounded px-2 py-1 text-xs">
            <span className="text-dark-500 mr-1">{i + 1}.</span>
            <span className="text-white font-mono">{word}</span>
          </div>
        ))}
      </div>
      <button
        onClick={copy}
        className={`w-full py-2 rounded-lg text-xs font-medium transition-all ${
          copied
            ? 'bg-green-600/20 border border-green-500/50 text-green-400'
            : 'bg-dark-700 border border-dark-600 text-dark-300 hover:bg-dark-600 hover:text-white'
        }`}
      >
        {copied ? '✓ Copied to clipboard!' : 'Copy seed phrase'}
      </button>
    </div>
  );
}

function NetworkSection({ activeNetwork, getAvailableNetworks, isSwitchingNetwork, isSyncing, onSwitch }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center">
            <span className="text-sm">🌐</span>
          </div>
          <span className="text-sm text-white">Network</span>
        </div>
        {isSwitchingNetwork && <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />}
      </div>
      <div className="flex gap-2">
        {getAvailableNetworks().map((net) => (
          <button
            key={net.id}
            onClick={() => onSwitch(net.id)}
            disabled={isSwitchingNetwork || isSyncing}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              activeNetwork === net.id
                ? net.id === 'mainnet'
                  ? 'bg-gradient-to-r from-bitcoin-500 to-orange-600 text-white shadow-lg'
                  : 'bg-gradient-to-r from-primary-500 to-blue-500 text-white shadow-lg'
                : 'bg-dark-700 text-dark-400 hover:bg-dark-600 hover:text-dark-300'
            }`}
          >
            {net.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResetSection() {
  const [confirm, setConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    try {
      setResetting(true);
      await clearAllWalletData();
      window.location.reload();
    } catch (err) {
      alert('Failed to reset wallet: ' + err.message);
      setResetting(false);
    }
  };

  return (
    <div className="mt-6 pt-4 border-t border-dark-700">
      <h3 className="text-sm font-medium text-dark-400 mb-3">Danger Zone</h3>
      {!confirm ? (
        <button
          onClick={() => setConfirm(true)}
          className="w-full card p-4 flex items-center justify-between hover:border-red-500/50 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-red-900/30 flex items-center justify-center">
              <span className="text-sm">🗑️</span>
            </div>
            <span className="text-sm text-red-400 group-hover:text-red-300">Reset Wallet</span>
          </div>
          <span className="text-dark-500">→</span>
        </button>
      ) : (
        <div className="card p-4 border-red-500/50 bg-red-900/10">
          <p className="text-sm text-red-300 mb-3">
            Are you sure? This will delete your wallet and all data. Make sure you have backed up your seed phrase!
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirm(false)}
              disabled={resetting}
              className="flex-1 py-2 px-3 rounded-lg bg-dark-700 text-white text-sm hover:bg-dark-600 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleReset}
              disabled={resetting}
              className="flex-1 py-2 px-3 rounded-lg bg-red-600 text-white text-sm hover:bg-red-500 transition-colors disabled:opacity-50"
            >
              {resetting ? 'Resetting...' : 'Yes, Reset'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SettingsScreen({ activeNetwork, getAvailableNetworks, isSwitchingNetwork, isSyncing, onNetworkSwitch }) {
  return (
    <div className="p-4">
      <h2 className="text-lg font-bold gradient-text mb-4">Settings</h2>
      <div className="space-y-2">
        <SeedPhraseSection />
        <NetworkSection
          activeNetwork={activeNetwork}
          getAvailableNetworks={getAvailableNetworks}
          isSwitchingNetwork={isSwitchingNetwork}
          isSyncing={isSyncing}
          onSwitch={onNetworkSwitch}
        />
        <div className="card p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center">
              <span className="text-sm">ℹ️</span>
            </div>
            <span className="text-sm text-white">About</span>
          </div>
          <span className="text-xs text-dark-500">v0.6.5</span>
        </div>
        <ResetSection />
      </div>
    </div>
  );
}
