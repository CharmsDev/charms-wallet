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

// Import wallet components
import WalletCreation from '@/components/wallet/setup/WalletCreation';
import WalletInitialization from '@/components/wallet/setup/WalletInitialization';

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

// Main extension app with all providers
export function ExtensionApp() {
  return (
    <ErrorBoundary>
      <WalletProvider>
        <NetworkProvider>
          <NavigationProvider>
            <UTXOProvider>
              <CharmsProvider>
                <ExtensionContent />
              </CharmsProvider>
            </UTXOProvider>
          </NavigationProvider>
        </NetworkProvider>
      </WalletProvider>
    </ErrorBoundary>
  );
}

// Inner content that uses wallet context
function ExtensionContent() {
  const {
    hasWallet,
    seedPhrase,
    isLoading,
    isCheckingWallet,
    isInitializing,
    initializationStep,
    initializationProgress,
    initializeWalletComplete
  } = useWallet();

  const [waitingForTransfer, setWaitingForTransfer] = useState(false);

  // Listen for wallet data arriving via web wallet transfer
  useEffect(() => {
    if (!waitingForTransfer) return;

    // Poll chrome.storage for seed phrase arrival (set by IMPORT_FROM_WEB handler)
    const interval = setInterval(async () => {
      try {
        const data = await new Promise(resolve =>
          chrome.storage.local.get(['wallet:seed_phrase'], resolve)
        );
        if (data['wallet:seed_phrase']) {
          clearInterval(interval);
          setWaitingForTransfer(false);
          // Reload to re-trigger wallet check and initialization
          window.location.reload();
        }
      } catch (_) {}
    }, 1500);

    return () => clearInterval(interval);
  }, [waitingForTransfer]);

  const handleCreateWallet = async () => {
    try {
      await initializeWalletComplete(null, false, 'bitcoin', 'mainnet');
    } catch (err) {
      console.error('Failed to create wallet:', err);
    }
  };

  const handleImportWallet = async (inputSeedPhrase) => {
    try {
      await initializeWalletComplete(inputSeedPhrase, true, 'bitcoin', 'mainnet');
    } catch (err) {
      console.error('Failed to import wallet:', err);
    }
  };

  const handleTransferFromWeb = () => {
    setWaitingForTransfer(true);
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

  // Waiting for transfer from web wallet
  if (waitingForTransfer) {
    return (
      <div className="flex items-center justify-center h-full bg-dark-950">
        <div className="text-center px-6 space-y-4">
          <div className="w-12 h-12 border-4 border-bitcoin-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-white font-medium">Waiting for wallet transfer...</p>
          <p className="text-sm text-gray-400">
            Go to <span className="text-bitcoin-400">wallet.charms.dev</span> and click "Transfer Wallet" in the banner at the top.
          </p>
          <button
            onClick={() => setWaitingForTransfer(false)}
            className="text-sm text-gray-500 hover:text-gray-300 underline mt-4"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // No wallet - show creation screen
  if (!hasWallet || !seedPhrase) {
    return (
      <div className="h-full overflow-auto">
        <WalletCreation
          isLoading={isLoading}
          onCreateWallet={handleCreateWallet}
          onImportWallet={handleImportWallet}
          onTransferFromWeb={handleTransferFromWeb}
        />
      </div>
    );
  }

  // Wallet exists - show extension dashboard
  return <ExtensionDashboard />;
}
