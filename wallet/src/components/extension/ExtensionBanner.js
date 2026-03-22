'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Download, ExternalLink, ArrowRightLeft } from 'lucide-react';

const CHROME_STORE_URL = 'https://chromewebstore.google.com/detail/charms-wallet/YOUR_EXTENSION_ID'; // TODO: replace with real URL

const STORAGE_KEYS = {
  CLICKED_DOWNLOAD: 'extension_banner_clicked_download',
  DISMISSED: 'extension_banner_dismissed',
};

/**
 * Extension Banner — handles:
 *
 * 1. AUTO-TRANSFER:  URL has ?transfer=<token> → transfer wallet data immediately (spinner)
 * 2. BIG BANNER:     Extension not installed → promote installation
 * 3. SLIM BAR:       User dismissed big banner, extension still not installed → reminder link
 * 4. TRANSFER BAR:   Extension installed but NO wallet in it → offer to transfer
 * 5. HIDDEN:         Extension installed WITH wallet → nothing to show
 */
export default function ExtensionBanner() {
  const [extensionState, setExtensionState] = useState(null); // null = checking
  const [hasClickedDownload, setHasClickedDownload] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  // Auto-transfer state
  const [isAutoTransfer, setIsAutoTransfer] = useState(false);
  const [transferStatus, setTransferStatus] = useState(null); // 'transferring' | 'success' | 'error'
  const transferAttempted = useRef(false);

  // Detect extension and wallet status — with periodic polling
  useEffect(() => {
    let initialTimeoutId;
    let pollIntervalId;

    const handleMessage = (event) => {
      if (event.source !== window) return;

      if (
        event.data.type === 'CHARMS_WALLET_EXTENSION_READY' ||
        event.data.type === 'CHARMS_WALLET_EXTENSION_DETECTED'
      ) {
        setExtensionState({
          installed: true,
          hasWallet: event.data.hasWallet ?? false,
        });
        clearTimeout(initialTimeoutId);
        // Stop polling once extension is detected
        if (pollIntervalId) clearInterval(pollIntervalId);
      }

      if (event.data.type === 'CHARMS_WALLET_IMPORT_SUCCESS') {
        setTransferStatus('success');
      }

      if (event.data.type === 'CHARMS_WALLET_IMPORT_ERROR') {
        setTransferStatus('error');
      }
    };

    window.addEventListener('message', handleMessage);

    // Initial check
    setTimeout(() => {
      window.postMessage({ type: 'CHARMS_WALLET_CHECK_EXTENSION' }, '*');
    }, 300);

    // If not detected after 2s, mark as not installed but keep polling
    initialTimeoutId = setTimeout(() => {
      setExtensionState(prev => prev === null ? { installed: false, hasWallet: false } : prev);
    }, 2000);

    // Keep polling every 5s in case user installs extension while page is open
    pollIntervalId = setInterval(() => {
      window.postMessage({ type: 'CHARMS_WALLET_CHECK_EXTENSION' }, '*');
    }, 5000);

    return () => {
      window.removeEventListener('message', handleMessage);
      clearTimeout(initialTimeoutId);
      clearInterval(pollIntervalId);
    };
  }, []);

  // Check URL for ?transfer= param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('transfer')) {
      setIsAutoTransfer(true);
    }
  }, []);

  // Auto-transfer: when extension is detected and ?transfer= is present, send data immediately
  useEffect(() => {
    if (!isAutoTransfer || !extensionState?.installed || transferAttempted.current) return;
    transferAttempted.current = true;
    setTransferStatus('transferring');

    // Collect wallet data from localStorage
    const walletData = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key === 'seedPhrase' ||
        key.includes('wallet') ||
        key.includes('bitcoin') ||
        key.includes('testnet') ||
        key.includes('mainnet') ||
        key.includes('active_') ||
        key.includes('balance') ||
        key.includes('utxo') ||
        key.includes('address') ||
        key.includes('transaction') ||
        key.includes('charms')
      ) {
        walletData[key] = localStorage.getItem(key);
      }
    }

    window.postMessage({
      type: 'CHARMS_WALLET_EXPORT',
      payload: walletData,
    }, '*');
  }, [isAutoTransfer, extensionState]);

  // Read localStorage
  useEffect(() => {
    setDismissed(localStorage.getItem(STORAGE_KEYS.DISMISSED) === 'true');
    setHasClickedDownload(localStorage.getItem(STORAGE_KEYS.CLICKED_DOWNLOAD) === 'true');
  }, []);

  // --- AUTO-TRANSFER MODE ---
  if (isAutoTransfer) {
    // Extension not installed — can't transfer
    if (extensionState && !extensionState.installed) {
      return (
        <div className="w-full bg-red-600/90 text-white text-center py-4 px-4 z-50">
          <p className="font-medium">Extension not detected</p>
          <p className="text-sm text-white/80 mt-1">
            Please install the Charms Wallet extension first, then try again.
          </p>
        </div>
      );
    }

    if (transferStatus === 'success') {
      return (
        <div className="w-full bg-green-600/90 text-white text-center py-4 px-4 z-50">
          <div className="flex items-center justify-center gap-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            <p className="font-medium">Wallet transferred successfully!</p>
          </div>
          <p className="text-sm text-white/80 mt-1">
            You can close this tab and open the extension.
          </p>
        </div>
      );
    }

    if (transferStatus === 'error') {
      return (
        <div className="w-full bg-red-600/90 text-white text-center py-4 px-4 z-50">
          <p className="font-medium">Transfer failed</p>
          <p className="text-sm text-white/80 mt-1">Please try again or import your seed phrase manually.</p>
        </div>
      );
    }

    // Waiting / transferring
    return (
      <div className="w-full bg-bitcoin-500/90 text-white text-center py-4 px-4 z-50">
        <div className="flex items-center justify-center gap-3">
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          <p className="font-medium">Transferring wallet to extension...</p>
        </div>
      </div>
    );
  }

  // --- NORMAL BANNER MODES ---

  if (extensionState === null) return null;

  // Extension installed WITH wallet → hidden
  if (extensionState.installed && extensionState.hasWallet) return null;

  // Extension installed, NO wallet → transfer bar
  if (extensionState.installed && !extensionState.hasWallet) {
    const handleTransfer = () => {
      setTransferStatus('transferring');
      transferAttempted.current = true;

      const walletData = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key === 'seedPhrase' ||
          key.includes('wallet') ||
          key.includes('bitcoin') ||
          key.includes('testnet') ||
          key.includes('mainnet') ||
          key.includes('active_') ||
          key.includes('balance') ||
          key.includes('utxo') ||
          key.includes('address') ||
          key.includes('transaction') ||
          key.includes('charms')
        ) {
          walletData[key] = localStorage.getItem(key);
        }
      }

      window.postMessage({
        type: 'CHARMS_WALLET_EXPORT',
        payload: walletData,
      }, '*');
    };

    if (transferStatus === 'success') {
      return (
        <div className="w-full bg-green-600/90 text-white text-center text-sm py-2 px-4 flex items-center justify-center gap-2 z-50">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          <span>Wallet transferred. Open the extension to continue.</span>
        </div>
      );
    }

    if (transferStatus === 'transferring') {
      return (
        <div className="w-full bg-bitcoin-500/90 text-white text-center text-sm py-2 px-4 flex items-center justify-center gap-2 z-50">
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          <span>Transferring wallet...</span>
        </div>
      );
    }

    return (
      <div className="w-full bg-bitcoin-500/90 text-white text-center text-sm py-2 px-4 flex items-center justify-center gap-3 z-50">
        <span>Extension detected — transfer your wallet to start using it.</span>
        <button
          onClick={handleTransfer}
          className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded font-medium inline-flex items-center gap-1.5 transition-colors"
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
          Transfer Wallet
        </button>
        {transferStatus === 'error' && (
          <span className="text-red-200 text-xs">Failed. Try again.</span>
        )}
      </div>
    );
  }

  // --- Extension NOT installed ---

  if (dismissed) return null;

  // Slim reminder bar
  if (hasClickedDownload) {
    return (
      <div className="w-full bg-bitcoin-500/90 text-white text-center text-sm py-1.5 px-4 flex items-center justify-center gap-3 z-50">
        <span>Install the Charms Wallet extension for a better experience.</span>
        <a
          href={CHROME_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-medium inline-flex items-center gap-1 hover:text-white/80"
        >
          Get it here <ExternalLink className="w-3 h-3" />
        </a>
        <button
          onClick={() => {
            setDismissed(true);
            localStorage.setItem(STORAGE_KEYS.DISMISSED, 'true');
          }}
          className="ml-2 p-0.5 hover:bg-white/20 rounded transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Big banner
  return (
    <div className="w-full bg-gradient-to-r from-dark-800 to-dark-900 border-b border-bitcoin-500/30 text-white z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-bitcoin-500/20 p-2 rounded-lg">
              <svg className="w-6 h-6 text-bitcoin-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-base">
                Charms Wallet is now available as a Browser Extension
              </p>
              <p className="text-sm text-dark-300">
                Manage your wallet directly from your browser. Connect to dApps, sign transactions, and more.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href={CHROME_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                setHasClickedDownload(true);
                localStorage.setItem(STORAGE_KEYS.CLICKED_DOWNLOAD, 'true');
              }}
              className="bg-bitcoin-500 hover:bg-bitcoin-600 text-white px-4 py-2 text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Install Extension
            </a>
            <button
              onClick={() => {
                setHasClickedDownload(true);
                localStorage.setItem(STORAGE_KEYS.CLICKED_DOWNLOAD, 'true');
              }}
              className="p-1.5 hover:bg-white/10 rounded transition-colors text-dark-400 hover:text-white"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
