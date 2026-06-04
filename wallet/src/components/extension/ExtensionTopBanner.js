'use client';

import { useState, useEffect, useRef } from 'react';

const STORAGE_KEY = 'extension_top_banner_dismissed';

// Visibility rules:
// - PWA (standalone display mode)         → never show (extension is irrelevant)
// - Mobile viewport (≤640px width)        → never show (extension is desktop-only)
// - Desktop web while extension is being
//   updated to the new G003+ architecture → hide temporarily.
//   Flip ENABLE_ON_DESKTOP back to true once the extension ships
//   the matching wallet flow.
const ENABLE_ON_DESKTOP = false;

/**
 * Top-level extension banner — sits above the header.
 *
 * States:
 * 1. Extension NOT installed → "Install now" banner (orange)
 * 2. Extension installed, NO wallet → "Transfer your wallet" banner (blue)
 * 3. Extension installed WITH wallet → hidden (forever, saved in localStorage)
 * 4. User dismissed → hidden
 */
export default function ExtensionTopBanner() {
  const [hidden, setHidden] = useState(true);
  const [extensionState, setExtensionState] = useState(null); // null=checking, {installed, hasWallet}
  const [transferStatus, setTransferStatus] = useState(null); // 'transferring' | 'success' | 'error'
  const [eligible, setEligible] = useState(false);
  const transferAttempted = useRef(false);

  // Eligibility check runs client-side after mount so SSR is unaffected.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!ENABLE_ON_DESKTOP) return;            // master kill-switch
    if (window.matchMedia('(display-mode: standalone)').matches) return;  // PWA
    if (window.matchMedia('(max-width: 640px)').matches) return;          // mobile
    setEligible(true);
  }, []);

  useEffect(() => {
    if (!eligible) return;
    // URL reset
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset') === 'true') {
      localStorage.removeItem(STORAGE_KEY);
      window.history.replaceState({}, '', window.location.pathname);
    }

    // Already dismissed permanently
    if (localStorage.getItem(STORAGE_KEY) === 'true') return;

    const handleMessage = (event) => {
      if (event.source !== window) return;

      if (event.data.type === 'CHARMS_WALLET_EXTENSION_READY' || event.data.type === 'CHARMS_WALLET_EXTENSION_DETECTED') {
        const hasWallet = event.data.hasWallet ?? false;
        setExtensionState({ installed: true, hasWallet });

        // Extension installed WITH wallet → hide forever
        if (hasWallet) {
          localStorage.setItem(STORAGE_KEY, 'true');
          setHidden(true);
        }
      }

      if (event.data.type === 'CHARMS_WALLET_IMPORT_SUCCESS') setTransferStatus('success');
      if (event.data.type === 'CHARMS_WALLET_IMPORT_ERROR') setTransferStatus('error');
    };

    window.addEventListener('message', handleMessage);
    window.postMessage({ type: 'CHARMS_WALLET_CHECK_EXTENSION' }, '*');

    // Show after initial check
    const timeout = setTimeout(() => {
      setExtensionState(prev => prev === null ? { installed: false, hasWallet: false } : prev);
      setHidden(false);
    }, 500);

    // Keep polling in case user installs while page is open
    const poll = setInterval(() => {
      window.postMessage({ type: 'CHARMS_WALLET_CHECK_EXTENSION' }, '*');
    }, 5000);

    return () => {
      window.removeEventListener('message', handleMessage);
      clearTimeout(timeout);
      clearInterval(poll);
    };
  }, [eligible]);

  if (!eligible || hidden || !extensionState) return null;

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setHidden(true);
  };

  const handleTransfer = () => {
    if (transferAttempted.current) return;
    transferAttempted.current = true;
    setTransferStatus('transferring');

    const walletData = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === 'seedPhrase' || key.includes('wallet') || key.includes('bitcoin') ||
          key.includes('testnet') || key.includes('mainnet') || key.includes('active_') ||
          key.includes('balance') || key.includes('utxo') || key.includes('address') ||
          key.includes('transaction') || key.includes('charms')) {
        walletData[key] = localStorage.getItem(key);
      }
    }
    window.postMessage({ type: 'CHARMS_WALLET_EXPORT', payload: walletData }, '*');
  };

  // --- Transfer success ---
  if (transferStatus === 'success') {
    setTimeout(() => { localStorage.setItem(STORAGE_KEY, 'true'); setHidden(true); }, 3000);
    return (
      <div className="w-full bg-green-600 text-white z-[99999] relative">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-center gap-2">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
          <span className="text-sm font-semibold">Wallet transferred! Open the extension to continue.</span>
        </div>
      </div>
    );
  }

  // --- Transferring ---
  if (transferStatus === 'transferring') {
    return (
      <div className="w-full bg-blue-600 text-white z-[99999] relative">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-center gap-2">
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold">Transferring wallet to extension...</span>
        </div>
      </div>
    );
  }

  // --- Extension installed, NO wallet → transfer banner (blue) ---
  if (extensionState.installed && !extensionState.hasWallet) {
    return (
      <div className="w-full bg-blue-600 text-white z-[99999] relative">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 014-4h14" />
              <path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 01-4 4H3" />
            </svg>
            <span className="text-sm font-semibold">Extension detected — transfer your wallet with one click</span>
            <button
              onClick={handleTransfer}
              className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-sm font-bold transition-colors"
            >
              Transfer Wallet
            </button>
          </div>
          <button onClick={handleDismiss} className="p-1 hover:bg-white/10 rounded transition-colors" aria-label="Close">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // --- Extension NOT installed → install banner (orange) ---
  return (
    <div className="w-full bg-bitcoin-500 text-black z-[99999] relative">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          <span className="text-sm font-semibold">Charms Wallet Extension is now available!</span>
          <a href="https://chromewebstore.google.com/detail/charms-wallet/cleeoicfddfoaclgacmodgcamdanamab" target="_blank" rel="noopener noreferrer" className="text-sm font-bold underline hover:no-underline">Install from Chrome Web Store</a>
        </div>
        <button onClick={handleDismiss} className="p-1 hover:bg-black/10 rounded transition-colors" aria-label="Close">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
