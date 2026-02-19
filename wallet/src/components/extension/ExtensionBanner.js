'use client';

import { useState, useEffect } from 'react';
import { X, Chrome, CheckCircle, AlertCircle, Download } from 'lucide-react';

export default function ExtensionBanner() {
  const [isExtensionInstalled, setIsExtensionInstalled] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState(null); // 'success' | 'error'
  const [extensionVersion, setExtensionVersion] = useState(null);

  useEffect(() => {
    // Only show banner if URL has ?ext=true parameter
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('ext') !== 'true') return;

    // Check if banner was dismissed
    const dismissed = localStorage.getItem('extension_banner_dismissed');
    if (dismissed) {
      // Clear dismissal if forcing banner via URL param
      localStorage.removeItem('extension_banner_dismissed');
    }

    // Check if extension is installed
    const checkExtension = () => {
      window.postMessage({ type: 'CHARMS_WALLET_CHECK_EXTENSION' }, '*');
    };

    // Listen for extension response
    const handleMessage = (event) => {
      if (event.source !== window) return;

      if (event.data.type === 'CHARMS_WALLET_EXTENSION_READY' || 
          event.data.type === 'CHARMS_WALLET_EXTENSION_DETECTED') {
        setIsExtensionInstalled(true);
        setExtensionVersion(event.data.version);
      }

      if (event.data.type === 'CHARMS_WALLET_IMPORT_SUCCESS') {
        setIsExporting(false);
        setExportStatus('success');
        setTimeout(() => {
          setShowBanner(false);
          localStorage.setItem('extension_banner_dismissed', 'true');
        }, 3000);
      }

      if (event.data.type === 'CHARMS_WALLET_IMPORT_ERROR') {
        setIsExporting(false);
        setExportStatus('error');
      }
    };

    window.addEventListener('message', handleMessage);
    
    // Check after a short delay to ensure content script is loaded
    setTimeout(checkExtension, 500);
    
    // Show banner after checking (whether extension is installed or not)
    setTimeout(() => setShowBanner(true), 600);

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleExportToExtension = async () => {
    setIsExporting(true);
    setExportStatus(null);

    try {
      // Get all wallet data from localStorage
      const allKeys = Object.keys(localStorage);
      const walletData = {};

      // Export all wallet-related keys
      allKeys.forEach(key => {
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
      });

      // Send to extension via content script
      window.postMessage({
        type: 'CHARMS_WALLET_EXPORT',
        payload: walletData
      }, '*');

    } catch (error) {
      console.error('Export error:', error);
      setIsExporting(false);
      setExportStatus('error');
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem('extension_banner_dismissed', 'true');
  };

  if (!showBanner) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-primary-600 to-bitcoin-500 text-white shadow-lg">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Chrome className="w-6 h-6 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">
                {isExtensionInstalled 
                  ? 'Chrome Extension detected!' 
                  : 'Charms Wallet Extension (dev)'}
              </p>
              <p className="text-sm text-white/90">
                {isExtensionInstalled
                  ? 'Export your wallet to the extension with one click'
                  : 'Download and install as unpacked extension in Chrome'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {exportStatus === 'success' && (
              <div className="flex items-center gap-2 bg-green-500/20 px-3 py-2 rounded-lg">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-medium">Exported!</span>
              </div>
            )}

            {exportStatus === 'error' && (
              <div className="flex items-center gap-2 bg-red-500/20 px-3 py-2 rounded-lg">
                <AlertCircle className="w-5 h-5" />
                <span className="text-sm font-medium">Export error</span>
              </div>
            )}

            {!exportStatus && (
              <>
                {isExtensionInstalled ? (
                  <button
                    onClick={handleExportToExtension}
                    disabled={isExporting}
                    className="btn btn-secondary bg-white text-primary-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                  >
                    {isExporting ? 'Exporting...' : 'Export to Extension'}
                  </button>
                ) : (
                  <a
                    href="/extension/charms-wallet-extension.zip"
                    download="charms-wallet-extension.zip"
                    className="btn btn-secondary bg-white text-primary-600 hover:bg-gray-100 px-4 py-2 text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download Extension
                  </a>
                )}
              </>
            )}

            <button
              onClick={handleDismiss}
              className="p-1 hover:bg-white/20 rounded transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {extensionVersion && (
          <p className="text-xs text-white/70 mt-1">
            Extension version: {extensionVersion}
          </p>
        )}
      </div>
    </div>
  );
}
