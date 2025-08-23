'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useWallet } from '@/stores/walletStore';
import { useWalletInfo } from '@/stores/walletInfoStore';
import { useBlockchain } from '@/stores/blockchainStore';
import { useSearchParams } from 'next/navigation';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import WalletCreation from '@/components/wallet/setup/WalletCreation';
import WalletDashboard from '@/components/wallet/setup/WalletDashboard';
import WalletInitialization from '@/components/wallet/setup/WalletInitialization';
import WalletExistsModal from '@/components/wallet/setup/WalletExistsModal';

// Initialize bitcoinjs-lib with ECC
bitcoin.initEccLib(ecc);

// Component that handles search params logic
function SearchParamsHandler({ onSeedParam, hasWallet, isCheckingWallet }) {
  const searchParams = useSearchParams();
  const seedProcessed = useRef(false);

  useEffect(() => {
    if (isCheckingWallet) return;

    const seedParam = searchParams.get('seed');
    if (seedParam && !seedProcessed.current) {
      onSeedParam(seedParam, hasWallet);
      seedProcessed.current = true;
    }
  }, [searchParams, hasWallet, isCheckingWallet, onSeedParam]);

  return null;
}

export default function Home() {
  const {
    hasWallet,
    seedPhrase,
    isLoading,
    error,
    isCheckingWallet,
    isInitializing,
    initializationStep,
    initializationProgress,
    initializeWalletComplete
  } = useWallet();
  const { walletInfo, derivationLoading, loadWalletInfo } = useWalletInfo();
  const { activeBlockchain, activeNetwork } = useBlockchain();
  const [initializationComplete, setInitializationComplete] = useState(false);
  const [showWalletExistsModal, setShowWalletExistsModal] = useState(false);

  const handleSeedParam = (seedParam, hasWallet) => {
    if (hasWallet) {
      setShowWalletExistsModal(true);
    } else {
      try {
        const decodedSeed = atob(seedParam);
        handleImportWallet(decodedSeed);

        // Clear the seed from the URL to prevent re-import on refresh
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('seed');
        window.history.replaceState({}, '', newUrl.toString());
      } catch (e) {
        console.error('Failed to decode seed from URL:', e);
      }
    }
  };

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

  return (
    <>
      <Suspense fallback={<div></div>}>
        <SearchParamsHandler 
          onSeedParam={handleSeedParam}
          hasWallet={hasWallet}
          isCheckingWallet={isCheckingWallet}
        />
      </Suspense>

      <WalletExistsModal
        isOpen={showWalletExistsModal}
        onClose={() => setShowWalletExistsModal(false)}
      />

      {isCheckingWallet ? (
        <div></div> // Or a loading spinner
      ) : isInitializing ? (
        <WalletInitialization
          initializationStep={initializationStep}
          initializationProgress={initializationProgress}
          onComplete={handleInitializationComplete}
        />
      ) : hasWallet && seedPhrase ? (
        <WalletDashboard
          seedPhrase={seedPhrase}
          walletInfo={walletInfo}
          derivationLoading={derivationLoading}
          createSuccess={initializationComplete}
        />
      ) : (
        <WalletCreation
          isLoading={isLoading}
          onCreateWallet={handleCreateWallet}
          onImportWallet={handleImportWallet}
        />
      )}
    </>
  );
}
