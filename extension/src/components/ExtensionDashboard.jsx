import { useState, useMemo, useEffect, useCallback } from 'react';
import { useWallet } from '@/stores/walletStore';
import { useAddresses } from '@/stores/addressesStore';
import { useCharms } from '@/stores/charmsStore';
import { useUTXOs } from '@/stores/utxoStore';
import { useNetwork, NETWORKS } from '@/contexts/NetworkContext';
import { useExtensionWalletSync } from '../hooks/useExtensionWalletSync';
import { getBroTokenAppId } from '@/services/charms/charms-explorer-api';
import { formatBTC } from '@/utils/formatters';
import { clearAllWalletData, getSeedPhrase } from '@/services/storage';
import { generateTaprootAddress } from '@/utils/addressUtils';
import { StorageAdapter } from '../shared/storage-adapter';
import { GLOBAL_KEYS } from '@/services/storage-keys';
import SendScreen from './SendScreen';

// Icons for bottom navigation
const HomeIcon = ({ active }) => (
  <svg className={`w-6 h-6 ${active ? 'text-primary-400' : 'text-dark-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

const AssetsIcon = ({ active }) => (
  <svg className={`w-6 h-6 ${active ? 'text-primary-400' : 'text-dark-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  </svg>
);

const ActivityIcon = ({ active }) => (
  <svg className={`w-6 h-6 ${active ? 'text-primary-400' : 'text-dark-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
  </svg>
);

const SettingsIcon = ({ active }) => (
  <svg className={`w-6 h-6 ${active ? 'text-primary-400' : 'text-dark-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

// Extension Dashboard with bottom navigation
export default function ExtensionDashboard() {
  const { hasWallet } = useWallet();
  const { addresses, loadAddresses, addAddress, loading: addressesLoading } = useAddresses();
  const { charms, getTotalByAppId, groupTokensByAppId, getNFTs, isLoading: charmsLoading } = useCharms();
  const { totalBalance, pendingBalance, isLoading: utxosLoading, loadUTXOs } = useUTXOs();
  const { activeBlockchain, activeNetwork, saveNetwork, getAvailableNetworks } = useNetwork();
  const { syncFullWallet, syncUTXOs, isSyncing, syncPhase, syncError } = useExtensionWalletSync();
  const [activeScreen, setActiveScreen] = useState('home'); // 'home', 'assets', 'activity', 'settings'
  const [copied, setCopied] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);

  // Send screen state
  const [showSend, setShowSend] = useState(false);

  // Receive screen state
  const [showReceive, setShowReceive] = useState(false);
  const [receiveAddress, setReceiveAddress] = useState('');
  const [receiveIndex, setReceiveIndex] = useState(0);
  const [isGeneratingAddress, setIsGeneratingAddress] = useState(false);
  const [receiveCopied, setReceiveCopied] = useState(false);

  // Network display label
  const networkLabel = useMemo(() => {
    const nets = getAvailableNetworks();
    const found = nets.find(n => n.id === activeNetwork);
    return found ? found.name : activeNetwork;
  }, [activeNetwork, getAvailableNetworks]);

  // Handle network switch
  const handleNetworkSwitch = useCallback(async (newNetwork) => {
    if (newNetwork === activeNetwork || isSwitchingNetwork || isSyncing) return;
    setIsSwitchingNetwork(true);
    try {
      // 1. Persist to context (localStorage) and chrome.storage.local
      saveNetwork(newNetwork);
      await StorageAdapter.set(GLOBAL_KEYS.ACTIVE_NETWORK, newNetwork);

      // 2. Reload addresses and UTXOs from cache for the new network
      await loadAddresses(activeBlockchain, newNetwork);
      await loadUTXOs(activeBlockchain, newNetwork);

      // 3. Load last-synced timestamp for the new network
      const ts = await StorageAdapter.get(`last_synced_${activeBlockchain}_${newNetwork}`);
      setLastSynced(ts ? new Date(ts) : null);
    } catch (err) {
      console.warn('[Dashboard] Network switch error:', err.message);
    } finally {
      setIsSwitchingNetwork(false);
    }
  }, [activeNetwork, activeBlockchain, isSwitchingNetwork, isSyncing, saveNetwork, loadAddresses, loadUTXOs]);

  // Storage key for last receive index (per blockchain+network)
  const receiveIndexKey = useMemo(
    () => `last_receive_index_${activeBlockchain}_${activeNetwork}`,
    [activeBlockchain, activeNetwork]
  );

  // Open Receive screen: load last persisted index and its address
  const openReceive = useCallback(async () => {
    setShowReceive(true);
    setReceiveCopied(false);
    setIsGeneratingAddress(true);
    try {
      const seedPhrase = await getSeedPhrase();
      if (!seedPhrase) throw new Error('No seed phrase');

      // Load persisted index (default 0)
      const stored = await StorageAdapter.get(receiveIndexKey);
      const idx = stored != null ? Number(stored) : 0;
      setReceiveIndex(idx);

      const addr = await generateTaprootAddress(seedPhrase, idx, false);
      setReceiveAddress(addr);

      // Make sure this address exists in the addresses store
      const existing = addresses.find(a => a.address === addr);
      if (!existing && addAddress) {
        await addAddress(
          { address: addr, index: idx, isChange: false, created: new Date().toISOString(), blockchain: activeBlockchain },
          activeBlockchain,
          activeNetwork
        );
      }
    } catch (err) {
      console.error('[Receive] Error loading receive address:', err);
    } finally {
      setIsGeneratingAddress(false);
    }
  }, [receiveIndexKey, addresses, addAddress, activeBlockchain, activeNetwork]);

  // Generate next receive address
  const generateNextReceiveAddress = useCallback(async () => {
    if (isGeneratingAddress) return;
    setIsGeneratingAddress(true);
    setReceiveCopied(false);
    try {
      const seedPhrase = await getSeedPhrase();
      if (!seedPhrase) throw new Error('No seed phrase');

      const nextIdx = receiveIndex + 1;
      const addr = await generateTaprootAddress(seedPhrase, nextIdx, false);

      // Persist the new index
      await StorageAdapter.set(receiveIndexKey, nextIdx);
      setReceiveIndex(nextIdx);
      setReceiveAddress(addr);

      // Ensure the new address is saved in the addresses store
      const existingAddresses = addresses || [];
      const alreadyExists = existingAddresses.find(a => a.address === addr);
      if (!alreadyExists && addAddress) {
        await addAddress(
          { address: addr, index: nextIdx, isChange: false, created: new Date().toISOString(), blockchain: activeBlockchain },
          activeBlockchain,
          activeNetwork
        );
      }
    } catch (err) {
      console.error('[Receive] Error generating next address:', err);
    } finally {
      setIsGeneratingAddress(false);
    }
  }, [isGeneratingAddress, receiveIndex, receiveIndexKey, addresses, addAddress, activeBlockchain, activeNetwork]);

  // Copy receive address
  const copyReceiveAddress = useCallback(() => {
    if (receiveAddress) {
      navigator.clipboard.writeText(receiveAddress);
      setReceiveCopied(true);
      setTimeout(() => setReceiveCopied(false), 2500);
    }
  }, [receiveAddress]);

  // Load cached data from storage on mount (NO auto-sync)
  useEffect(() => {
    if (hasWallet) {
      loadAddresses(activeBlockchain, activeNetwork);
      loadUTXOs(activeBlockchain, activeNetwork);
      // Load last-synced timestamp
      StorageAdapter.get(`last_synced_${activeBlockchain}_${activeNetwork}`).then(ts => {
        if (ts) setLastSynced(new Date(ts));
      });
    }
  }, [hasWallet, activeBlockchain, activeNetwork, loadAddresses, loadUTXOs]);

  // Manual sync handler (saves timestamp after completion)
  const handleManualSync = useCallback(async () => {
    try {
      await syncFullWallet();
      const now = new Date();
      setLastSynced(now);
      await StorageAdapter.set(`last_synced_${activeBlockchain}_${activeNetwork}`, now.toISOString());
    } catch (err) {
      console.warn('[Dashboard] Manual sync error:', err.message);
    }
  }, [syncFullWallet, activeBlockchain, activeNetwork]);

  // Reset wallet - clear all data and reload
  const handleResetWallet = async () => {
    try {
      setIsResetting(true);
      await clearAllWalletData();
      // Reload the extension popup to show wallet creation screen
      window.location.reload();
    } catch (error) {
      console.error('Failed to reset wallet:', error);
      alert('Failed to reset wallet: ' + error.message);
      setIsResetting(false);
    }
  };

  // Get primary address
  const primaryAddress = useMemo(() => {
    if (addresses && addresses.length > 0) {
      return addresses[0]?.address || '';
    }
    return '';
  }, [addresses]);

  // BRO token balance
  const broBalance = useMemo(() => {
    const targetId = getBroTokenAppId();
    return getTotalByAppId(targetId);
  }, [charms, getTotalByAppId]);

  // Get all charms grouped
  const nfts = useMemo(() => getNFTs(), [charms, getNFTs]);
  const tokens = useMemo(() => groupTokensByAppId(), [charms, groupTokensByAppId]);

  // Copy address to clipboard
  const copyAddress = () => {
    if (primaryAddress) {
      navigator.clipboard.writeText(primaryAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-col h-full bg-dark-950">
      {/* Header */}
      <header className="glass-effect flex items-center justify-between px-4 py-3 border-b border-dark-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-bitcoin-500 to-orange-600 flex items-center justify-center bitcoin-glow">
            <span className="text-sm font-bold text-white">₿</span>
          </div>
          <span className="font-semibold gradient-text">Charms Wallet</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 px-2 py-1 rounded-full border ${
            activeNetwork === 'mainnet'
              ? 'bg-orange-900/30 border-orange-600/50'
              : 'bg-dark-800 border-dark-600'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${
              activeNetwork === 'mainnet' ? 'bg-orange-500' : 'bg-green-500'
            }`} />
            <span className={`text-xs ${
              activeNetwork === 'mainnet' ? 'text-orange-400' : 'text-dark-400'
            }`}>{networkLabel}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {isSyncing && (
              <span className="text-[10px] text-dark-400 whitespace-nowrap">
                {syncPhase === 'utxos' ? 'BTC...' : syncPhase === 'charms' ? '$BRO...' : ''}
              </span>
            )}
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="p-2 rounded-lg glass-effect hover:bg-dark-700 transition-colors"
              title={lastSynced ? `Last synced: ${lastSynced.toLocaleTimeString()}` : 'Sync wallet'}
            >
              <svg
                className={`w-5 h-5 text-dark-300 ${isSyncing ? 'animate-spin' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto">
        {activeScreen === 'home' && (
          <div className="p-4 space-y-4">
            {/* Address Card */}
            <button 
              onClick={copyAddress}
              className="w-full card p-3 flex items-center justify-between hover:border-primary-500/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-primary-500 to-blue-500 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="text-left">
                  <div className="text-xs text-dark-400">Your Address</div>
                  <div className="text-sm text-white font-mono">
                    {primaryAddress ? `${primaryAddress.slice(0, 10)}...${primaryAddress.slice(-6)}` : 'Loading...'}
                  </div>
                </div>
              </div>
              <div className={`text-xs ${copied ? 'text-green-400' : 'text-dark-400'}`}>
                {copied ? '✓ Copied!' : 'Copy'}
              </div>
            </button>

            {/* Balance Cards */}
            <div className="grid grid-cols-2 gap-3">
              {/* BTC Balance */}
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

              {/* BRO Balance */}
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
                <div className="text-xl font-bold text-purple-400">
                  {isSyncing ? '--' : Number(broBalance || 0).toFixed(2)}
                </div>
                {isSyncing && syncPhase === 'charms' && (
                  <div className="text-[10px] text-purple-400/60 mt-0.5">updating...</div>
                )}
                <div className="text-xs text-dark-500">$BRO</div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowSend(true)}
                className="btn btn-bitcoin flex-1 py-3"
              >
                <span className="mr-1">↗</span> Send
              </button>
              <button
                onClick={openReceive}
                className="btn btn-secondary flex-1 py-3"
              >
                <span className="mr-1">↙</span> Receive
              </button>
            </div>

            {/* Quick Assets Preview */}
            <div className="card">
              <div className="flex items-center justify-between p-3 border-b border-dark-700">
                <span className="text-sm font-medium text-white">Assets</span>
                <button 
                  onClick={() => setActiveScreen('assets')}
                  className="text-xs text-primary-400 hover:text-primary-300"
                >
                  View All →
                </button>
              </div>
              <div className="p-2">
                {charmsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : tokens.length === 0 && nfts.length === 0 ? (
                  <div className="text-center py-4 text-dark-500 text-sm">
                    No assets yet
                  </div>
                ) : (
                  <div className="space-y-1">
                    {tokens.slice(0, 3).map((token, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded-lg hover:bg-dark-700/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                            <span className="text-xs font-bold text-white">T</span>
                          </div>
                          <span className="text-sm text-white">{token.ticker || 'Token'}</span>
                        </div>
                        <span className="text-sm text-dark-300">{isSyncing ? '--' : (Number(token.totalAmount || 0).toFixed(2))}</span>
                      </div>
                    ))}
                    {tokens.length + nfts.length > 3 && (
                      <div className="text-center text-xs text-dark-500 py-1">
                        +{tokens.length + nfts.length - 3} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeScreen === 'assets' && (
          <div className="p-4">
            <h2 className="text-lg font-bold gradient-text mb-4">Your Assets</h2>
            {charmsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : tokens.length === 0 && nfts.length === 0 ? (
              <div className="card p-8 text-center">
                <div className="text-4xl mb-3">📦</div>
                <div className="text-dark-400">No assets found</div>
                <div className="text-xs text-dark-500 mt-1">Your tokens and NFTs will appear here</div>
              </div>
            ) : (
              <div className="space-y-2">
                {tokens.map((token, idx) => (
                  <div key={idx} className="card p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                        <span className="text-sm font-bold text-white">T</span>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">{token.ticker || 'Token'}</div>
                        <div className="text-xs text-dark-500">{token.app_id?.slice(0, 20)}...</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-white">{Number(token.totalAmount || 0).toFixed(4)}</div>
                    </div>
                  </div>
                ))}
                {nfts.map((nft, idx) => (
                  <div key={idx} className="card p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center overflow-hidden">
                        {nft.image_url ? (
                          <img src={nft.image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm font-bold text-white">N</span>
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">{nft.name || 'NFT'}</div>
                        <div className="text-xs text-dark-500">NFT</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeScreen === 'activity' && (
          <div className="p-4">
            <h2 className="text-lg font-bold gradient-text mb-4">Activity</h2>
            <div className="card p-8 text-center">
              <div className="text-4xl mb-3">📋</div>
              <div className="text-dark-400">Coming soon</div>
              <div className="text-xs text-dark-500 mt-1">Transaction history will appear here</div>
            </div>
          </div>
        )}

        {activeScreen === 'settings' && (
          <div className="p-4">
            <h2 className="text-lg font-bold gradient-text mb-4">Settings</h2>
            <div className="space-y-2">
              <div className="card p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center">
                    <span className="text-sm">🔐</span>
                  </div>
                  <span className="text-sm text-white">Export Seed Phrase</span>
                </div>
                <span className="text-dark-500">→</span>
              </div>
              <div className="card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center">
                      <span className="text-sm">🌐</span>
                    </div>
                    <span className="text-sm text-white">Network</span>
                  </div>
                  {isSwitchingNetwork && (
                    <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  )}
                </div>
                <div className="flex gap-2">
                  {getAvailableNetworks().map((net) => (
                    <button
                      key={net.id}
                      onClick={() => handleNetworkSwitch(net.id)}
                      disabled={isSwitchingNetwork || isSyncing}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                        activeNetwork === net.id
                          ? net.id === 'mainnet'
                            ? 'bg-gradient-to-r from-bitcoin-500 to-orange-600 text-white shadow-lg'
                            : 'bg-gradient-to-r from-primary-500 to-blue-500 text-white shadow-lg'
                          : 'bg-dark-700 text-dark-400 hover:bg-dark-600 hover:text-dark-300'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {net.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="card p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center">
                    <span className="text-sm">ℹ️</span>
                  </div>
                  <span className="text-sm text-white">About</span>
                </div>
                <span className="text-xs text-dark-500">v0.6.4</span>
              </div>

              {/* Reset Wallet Section */}
              <div className="mt-6 pt-4 border-t border-dark-700">
                <h3 className="text-sm font-medium text-dark-400 mb-3">Danger Zone</h3>
                {!showResetConfirm ? (
                  <button
                    onClick={() => setShowResetConfirm(true)}
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
                        onClick={() => setShowResetConfirm(false)}
                        className="flex-1 py-2 px-3 rounded-lg bg-dark-700 text-white text-sm hover:bg-dark-600 transition-colors"
                        disabled={isResetting}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleResetWallet}
                        disabled={isResetting}
                        className="flex-1 py-2 px-3 rounded-lg bg-red-600 text-white text-sm hover:bg-red-500 transition-colors disabled:opacity-50"
                      >
                        {isResetting ? 'Resetting...' : 'Yes, Reset'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== Send Screen Overlay ===== */}
      {showSend && (
        <SendScreen onClose={() => setShowSend(false)} syncUTXOs={syncUTXOs} />
      )}

      {/* ===== Receive Screen Overlay ===== */}
      {showReceive && (
        <div className="absolute inset-0 z-50 flex flex-col bg-dark-950">
          {/* Receive Header */}
          <header className="glass-effect flex items-center justify-between px-4 py-3 border-b border-dark-700">
            <button
              onClick={() => setShowReceive(false)}
              className="flex items-center gap-1 text-dark-300 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-sm">Back</span>
            </button>
            <span className="font-semibold gradient-text">Receive</span>
            <div className="w-16" />{/* spacer for centering */}
          </header>

          {/* Receive Content */}
          <div className="flex-1 overflow-auto p-4 flex flex-col items-center">
            {/* Icon */}
            <div className="w-16 h-16 rounded-full bg-gradient-to-r from-primary-500 to-blue-500 flex items-center justify-center mb-4 mt-2">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </div>

            <h2 className="text-lg font-bold text-white mb-1">Your Receive Address</h2>
            <p className="text-xs text-dark-400 text-center mb-5 px-4 leading-relaxed">
              Send <span className="text-bitcoin-500 font-medium">Bitcoin</span>,{' '}
              <span className="text-purple-400 font-medium">Charms</span>,{' '}
              <span className="text-purple-400 font-medium">$BRO tokens</span>{' '}
              or any other asset to this address.
            </p>

            {/* Address Card */}
            <div className="w-full card p-4 mb-4">
              {/* Address type badge */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary-500" />
                  <span className="text-xs font-medium text-primary-400">Taproot (P2TR)</span>
                </div>
                <span className="text-xs text-dark-500">BIP-86 #{receiveIndex}</span>
              </div>

              {/* Full address display */}
              {isGeneratingAddress ? (
                <div className="flex items-center justify-center py-4">
                  <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div
                  onClick={copyReceiveAddress}
                  className="cursor-pointer group"
                >
                  <p className="text-sm font-mono text-white break-all leading-relaxed group-hover:text-primary-300 transition-colors">
                    {receiveAddress}
                  </p>
                </div>
              )}
            </div>

            {/* Copy Button */}
            <button
              onClick={copyReceiveAddress}
              disabled={isGeneratingAddress || !receiveAddress}
              className={`w-full py-3 rounded-xl text-sm font-semibold transition-all mb-3 ${
                receiveCopied
                  ? 'bg-green-600/20 border border-green-500/50 text-green-400'
                  : 'bg-gradient-to-r from-primary-500 to-blue-500 text-white hover:shadow-lg hover:shadow-primary-500/25'
              } disabled:opacity-50`}
            >
              {receiveCopied ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied to clipboard!
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  Copy Address
                </span>
              )}
            </button>

            {/* Generate New Address Button */}
            <button
              onClick={generateNextReceiveAddress}
              disabled={isGeneratingAddress}
              className="w-full py-3 rounded-xl text-sm font-medium bg-dark-800 border border-dark-600 text-dark-300 hover:bg-dark-700 hover:text-white hover:border-dark-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed mb-6"
            >
              {isGeneratingAddress ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-dark-400 border-t-transparent rounded-full animate-spin" />
                  Generating...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Generate New Address
                </span>
              )}
            </button>

            {/* Info section */}
            <div className="w-full card p-3 bg-dark-800/50">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-dark-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-dark-400 leading-relaxed">
                  New addresses are derived from your seed phrase. Previous addresses remain active.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="glass-effect border-t border-dark-700 px-2 py-1 safe-area-bottom">
        <div className="flex justify-around">
          <button
            onClick={() => setActiveScreen('home')}
            className={`flex flex-col items-center py-2 px-4 rounded-lg transition-colors ${activeScreen === 'home' ? 'bg-dark-800' : 'hover:bg-dark-800/50'}`}
          >
            <HomeIcon active={activeScreen === 'home'} />
            <span className={`text-xs mt-1 ${activeScreen === 'home' ? 'text-primary-400' : 'text-dark-500'}`}>Home</span>
          </button>
          <button
            onClick={() => setActiveScreen('assets')}
            className={`flex flex-col items-center py-2 px-4 rounded-lg transition-colors ${activeScreen === 'assets' ? 'bg-dark-800' : 'hover:bg-dark-800/50'}`}
          >
            <AssetsIcon active={activeScreen === 'assets'} />
            <span className={`text-xs mt-1 ${activeScreen === 'assets' ? 'text-primary-400' : 'text-dark-500'}`}>Assets</span>
          </button>
          <button
            onClick={() => setActiveScreen('activity')}
            className={`flex flex-col items-center py-2 px-4 rounded-lg transition-colors ${activeScreen === 'activity' ? 'bg-dark-800' : 'hover:bg-dark-800/50'}`}
          >
            <ActivityIcon active={activeScreen === 'activity'} />
            <span className={`text-xs mt-1 ${activeScreen === 'activity' ? 'text-primary-400' : 'text-dark-500'}`}>Activity</span>
          </button>
          <button
            onClick={() => setActiveScreen('settings')}
            className={`flex flex-col items-center py-2 px-4 rounded-lg transition-colors ${activeScreen === 'settings' ? 'bg-dark-800' : 'hover:bg-dark-800/50'}`}
          >
            <SettingsIcon active={activeScreen === 'settings'} />
            <span className={`text-xs mt-1 ${activeScreen === 'settings' ? 'text-primary-400' : 'text-dark-500'}`}>Settings</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
