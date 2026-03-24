'use client';

import { useState, useEffect } from 'react';
import { X, Download } from 'lucide-react';

const STORAGE_KEY = 'extension_banner_dismissed';

/**
 * Extension Banner — simple, visible by default.
 * Hidden if: user dismissed it OR extension is detected.
 * Rendered inside UserDashboard, no provider dependencies.
 */
export default function ExtensionBanner() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // Check if dismissed
    if (localStorage.getItem(STORAGE_KEY) === 'true') {
      setHidden(true);
      return;
    }

    // Check URL reset
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset') === 'true') {
      localStorage.removeItem(STORAGE_KEY);
      window.history.replaceState({}, '', window.location.pathname);
    }

    // Check if extension is installed
    const handleMessage = (event) => {
      if (event.source !== window) return;
      if (event.data.type === 'CHARMS_WALLET_EXTENSION_READY' || event.data.type === 'CHARMS_WALLET_EXTENSION_DETECTED') {
        setHidden(true);
      }
    };
    window.addEventListener('message', handleMessage);
    window.postMessage({ type: 'CHARMS_WALLET_CHECK_EXTENSION' }, '*');
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  if (hidden) return null;

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setHidden(true);
  };

  return (
    <div className="w-full bg-gradient-to-r from-dark-800 to-dark-900 border border-bitcoin-500/30 rounded-lg text-white">
      <div className="px-4 py-4">
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
              <p className="font-semibold text-base">Charms Wallet is now available as a Browser Extension</p>
              <p className="text-sm text-dark-300">Manage your wallet directly from your browser. Connect to dApps, sign transactions, and more.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href="/extension-install"
              className="bg-bitcoin-500 hover:bg-bitcoin-600 text-white px-4 py-2 text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Install Extension
            </a>
            <button
              onClick={handleDismiss}
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
