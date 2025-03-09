'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@/stores/walletStore';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import WalletCreation from '@/components/wallet/setup/WalletCreation';
import WalletDashboard from '@/components/wallet/setup/WalletDashboard';

// Initialize bitcoinjs-lib with the ECC library
bitcoin.initEccLib(ecc);

export default function Home() {
  const { hasWallet, seedPhrase, isLoading, error, createWallet } = useWallet();
  const [createSuccess, setCreateSuccess] = useState(false);
  const [walletInfo, setWalletInfo] = useState({
    xpub: '',
    xpriv: '',
    fingerprint: '',
    path: '86h/0h/0h',
    derivationLoading: false
  });

  // Derive wallet info when seed phrase is available
  useEffect(() => {
    const deriveWalletInfo = async () => {
      if (hasWallet && seedPhrase) {
        try {
          setWalletInfo(prev => ({ ...prev, derivationLoading: true }));

          // Import the deriveXpubFromSeedPhrase function from descriptorUtils
          const { deriveXpubFromSeedPhrase } = await import('@/utils/descriptorUtils');

          // Derive the wallet info from the seed phrase
          const { xpub, xpriv, fingerprint, path } = await deriveXpubFromSeedPhrase(seedPhrase);

          // Set the wallet info with real values
          setWalletInfo({
            xpub,
            xpriv,
            fingerprint,
            path,
            derivationLoading: false
          });
        } catch (error) {
          console.error('Error deriving wallet info:', error);
          setWalletInfo(prev => ({ ...prev, derivationLoading: false }));
        }
      }
    };

    deriveWalletInfo();
  }, [hasWallet, seedPhrase]);

  const handleCreateWallet = async () => {
    try {
      await createWallet();
      setCreateSuccess(true);
    } catch (err) {
      console.error('Error creating wallet:', err);
    }
  };

  const handleImportWallet = async (inputSeedPhrase) => {
    try {
      // Implementation for importing would go here
      console.log('Import wallet clicked with seed phrase:', inputSeedPhrase);
    } catch (err) {
      console.error('Error importing wallet:', err);
    }
  };

  // If we have a wallet, show the wallet dashboard
  if (hasWallet && seedPhrase) {
    return (
      <WalletDashboard
        seedPhrase={seedPhrase}
        walletInfo={walletInfo}
        createSuccess={createSuccess}
      />
    );
  }

  // Default view - create or import wallet
  return (
    <WalletCreation
      isLoading={isLoading}
      onCreateWallet={handleCreateWallet}
      onImportWallet={handleImportWallet}
    />
  );
}
