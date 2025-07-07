'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@/stores/walletStore';
import { useWalletInfo } from '@/stores/walletInfoStore';
import { useBlockchain } from '@/stores/blockchainStore';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import WalletCreation from '@/components/wallet/setup/WalletCreation';
import WalletDashboard from '@/components/wallet/setup/WalletDashboard';
import WalletInitialization from '@/components/wallet/setup/WalletInitialization';

// Initialize bitcoinjs-lib with ECC
bitcoin.initEccLib(ecc);

export default function Home() {
  const {
    hasWallet,
    seedPhrase,
    isLoading,
    error,
    isInitializing,
    initializationStep,
    initializationProgress,
    initializeWalletComplete
  } = useWallet();
  const { walletInfo, derivationLoading, loadWalletInfo } = useWalletInfo();
  const { activeBlockchain, activeNetwork } = useBlockchain();
  const [initializationComplete, setInitializationComplete] = useState(false);

  // Load wallet info when wallet exists and is not initializing
  useEffect(() => {
    if (hasWallet && seedPhrase && !isInitializing && !derivationLoading) {
      loadWalletInfo(seedPhrase, activeBlockchain, activeNetwork);
    }
  }, [hasWallet, seedPhrase, isInitializing, derivationLoading, loadWalletInfo, activeBlockchain, activeNetwork]);

  const handleCreateWallet = async () => {
    try {
      await initializeWalletComplete(null, false, activeBlockchain, activeNetwork);
    } catch (err) {
      console.error('Error creating wallet:', err);
    }
  };

  const handleImportWallet = async (inputSeedPhrase) => {
    try {
      await initializeWalletComplete(inputSeedPhrase, true, activeBlockchain, activeNetwork);
    } catch (err) {
      console.error('Error importing wallet:', err);
    }
  };

  const handleInitializationComplete = () => {
    setInitializationComplete(true);
    // Small delay for smooth transition
    setTimeout(() => {
      setInitializationComplete(false);
    }, 500);
  };

  // Show initialization screen
  if (isInitializing) {
    return (
      <WalletInitialization
        initializationStep={initializationStep}
        initializationProgress={initializationProgress}
        onComplete={handleInitializationComplete}
      />
    );
  }

  // Show wallet dashboard if available and not initializing
  if (hasWallet && seedPhrase && !isInitializing) {
    return (
      <WalletDashboard
        seedPhrase={seedPhrase}
        walletInfo={walletInfo}
        derivationLoading={derivationLoading}
        createSuccess={initializationComplete}
      />
    );
  }

  // Default view: create or import wallet
  return (
    <WalletCreation
      isLoading={isLoading}
      onCreateWallet={handleCreateWallet}
      onImportWallet={handleImportWallet}
    />
  );
}
