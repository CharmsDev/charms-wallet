import React, { useEffect, useState, Component } from 'react';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';

// Initialize extension
import { initializeExtension } from './init';

// Import providers from wallet
import { WalletProvider, useWallet } from '@/stores/walletStore';
import { NetworkProvider } from '@/contexts/NetworkContext';
import { NavigationProvider } from '@/contexts/NavigationContext';
import { UTXOProvider } from '@/stores/utxoStore';
import { CharmsProvider } from '@/stores/charmsStore';
import { BeamOperationsProvider } from '@/contexts/BeamOperationsContext';
import { AuthProvider } from '@/contexts/AuthContext';

// Import wallet components
import WalletSetupWizard from '@/components/wallet/setup/WalletSetupWizard';
import WalletInitialization from '@/components/wallet/setup/WalletInitialization';
import UnlockGate from '@/components/system/UnlockGate';
import MigrationGate from '@/components/system/MigrationGate';

// Extension-specific dashboard (simplified for popup)
import ExtensionDashboard from './components/ExtensionDashboard';

// Initialize bitcoinjs-lib with ECC
bitcoin.initEccLib(ecc);

// Error Boundary to catch and display errors
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('Extension Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-red-900/50 text-white h-full overflow-auto">
          <h2 className="text-lg font-bold mb-2">⚠️ Error en la extensión</h2>
          <p className="text-sm text-red-300 mb-2">{this.state.error?.message}</p>
          <pre className="text-xs bg-black/30 p-2 rounded overflow-auto max-h-80">
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// Main extension app with all providers.
//
// Provider order mirrors the web wallet's layout.js: WalletProvider
// owns the seed state, AuthProvider sits inside so useWallet() resolves
// for hydration on unlock, UnlockGate blocks the rest of the tree when
// status='locked', and MigrationGate forces legacy plaintext users to
// adopt a passkey or password before reaching the dashboard.
export function ExtensionApp() {
  return (
    <ErrorBoundary>
      <WalletProvider>
        <AuthProvider>
          <UnlockGate>
            <MigrationGate>
              <NetworkProvider>
                <NavigationProvider>
                  <UTXOProvider>
                    <CharmsProvider>
                      <BeamOperationsProvider>
                        <ExtensionContent />
                      </BeamOperationsProvider>
                    </CharmsProvider>
                  </UTXOProvider>
                </NavigationProvider>
              </NetworkProvider>
            </MigrationGate>
          </UnlockGate>
        </AuthProvider>
      </WalletProvider>
    </ErrorBoundary>
  );
}

// Inner content that uses wallet context
function ExtensionContent() {
  const {
    hasWallet,
    seedPhrase,
    isCheckingWallet,
    isInitializing,
    initializationStep,
    initializationProgress,
  } = useWallet();

  const [linking, setLinking] = useState(false);

  // Watch for the linked wallet landing in storage. The handshake happens
  // in another tab, so poll rather than listen: this popup can be closed
  // and reopened while the user is over there, and storage survives that.
  useEffect(() => {
    if (!linking) return;

    const interval = setInterval(async () => {
      try {
        const data = await new Promise(resolve =>
          chrome.storage.local.get(['wallet:auth'], resolve)
        );
        if (data['wallet:auth']) {
          clearInterval(interval);
          setLinking(false);
          // Reload so the wallet check and the auth gates see the new blob
          window.location.reload();
        }
      } catch (_) {}
    }, 1500);

    return () => clearInterval(interval);
  }, [linking]);

  // Hand the wallet over from wallet.charms.dev. What crosses is the auth
  // blob and the address book, never the mnemonic — the old plaintext
  // transfer is gone. The request id parks here first so the service
  // worker can refuse a stale tab.
  const handleLinkWebWallet = async () => {
    const requestId = `lnk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await chrome.storage.local.set({ 'ext:link_pending': { requestId, at: Date.now() } });
    window.open(`https://wallet.charms.dev/extension-link?req=${encodeURIComponent(requestId)}`, '_blank');
    setLinking(true);
  };

  // Loading state while checking for existing wallet
  if (isCheckingWallet) {
    return (
      <div className="flex items-center justify-center h-full bg-dark-950">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-bitcoin-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading Charms Wallet...</p>
        </div>
      </div>
    );
  }

  // Wallet initialization in progress
  if (isInitializing) {
    return (
      <div className="h-full overflow-auto">
        <WalletInitialization
          initializationStep={initializationStep}
          initializationProgress={initializationProgress}
          onComplete={() => {}}
        />
      </div>
    );
  }

  // Waiting for the link to complete in the other tab
  if (linking) {
    return (
      <div className="flex items-center justify-center h-full bg-dark-950">
        <div className="text-center px-6 space-y-4">
          <div className="w-12 h-12 border-4 border-bitcoin-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-white font-medium">Waiting for the wallet tab…</p>
          <p className="text-sm text-gray-400">
            Approve the link on <span className="text-bitcoin-400">wallet.charms.dev</span>, in the tab that just opened.
          </p>
          <button
            onClick={() => setLinking(false)}
            className="text-sm text-gray-500 hover:text-gray-300 underline mt-4"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // No wallet — drive setup through the unified wizard (password only
  // here; a passkey cannot be enrolled on a chrome-extension:// origin).
  // Linking an existing web wallet is surfaced as an extra option on the
  // choose step, and is the path that keeps the seed where it is.
  if (!hasWallet || !seedPhrase) {
    return (
      <div className="h-full overflow-auto">
        <WalletSetupWizard
          extraAction={{
            label: 'Link my Charms Web Wallet',
            onClick: handleLinkWebWallet,
          }}
        />
      </div>
    );
  }

  // Wallet exists - show extension dashboard
  return <ExtensionDashboard />;
}
