'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useWallet } from '@/stores/walletStore';
import { useWalletInfo } from '@/stores/walletInfoStore';
import { useBlockchain } from '@/stores/blockchainStore';
import { useSearchParams } from 'next/navigation';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import WalletCreation from '@/components/wallet/setup/WalletCreation';
import UserDashboard from '@/components/wallet/dashboard/UserDashboard';
import WalletInitialization from '@/components/wallet/setup/WalletInitialization';
import WalletExistsModal from '@/components/wallet/setup/WalletExistsModal';
import { runMigrations } from '@/migrations';

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
    const normalizeSeed = (s) => (s ? s.trim().toLowerCase().replace(/\s+/g, ' ') : '');

    try {
      const decodedSeed = atob(seedParam);

      if (hasWallet) {
        // If the incoming seed matches the existing wallet, do nothing (stay in wallet) and clear URL param
        if (normalizeSeed(decodedSeed) === normalizeSeed(seedPhrase)) {
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('seed');
          window.history.replaceState({}, '', newUrl.toString());
          return;
        }
        // Different wallet seed provided: show the existing modal
        setShowWalletExistsModal(true);
      } else {
        // No wallet yet: proceed with import
        handleImportWallet(decodedSeed);
        // Clear the seed from the URL to prevent re-import on refresh
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('seed');
        window.history.replaceState({}, '', newUrl.toString());
      }
    } catch (e) {
      if (hasWallet) {
        // Keep prior behavior if decoding fails and a wallet exists
        setShowWalletExistsModal(true);
      }
    }
  };

  // Run migrations on app startup
  useEffect(() => {
    const initializeMigrations = async () => {
      try {
        await runMigrations();
      } catch (error) {
      }
    };
    
    initializeMigrations();
  }, []);

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
    }
  };

  const handleImportWallet = async (inputSeedPhrase) => {
    try {
      await initializeWalletComplete(inputSeedPhrase, true, activeBlockchain, activeNetwork);
    } catch (err) {
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
        <UserDashboard
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
