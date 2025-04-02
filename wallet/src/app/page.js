'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@/stores/walletStore';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import WalletCreation from '@/components/wallet/setup/WalletCreation';
import WalletDashboard from '@/components/wallet/setup/WalletDashboard';

// Initialize bitcoinjs-lib with ECC
bitcoin.initEccLib(ecc);

export default function Home() {
  const { hasWallet, seedPhrase, isLoading, error, createWallet, importWallet } = useWallet();
  const [createSuccess, setCreateSuccess] = useState(false);
  const [walletInfo, setWalletInfo] = useState({
    xpub: '',
    xpriv: '',
    fingerprint: '',
    path: '86h/0h/0h',
    derivationLoading: false
  });

  // Derive wallet info on seed phrase
  useEffect(() => {
    const deriveWalletInfo = async () => {
      if (hasWallet && seedPhrase) {
        try {
          setWalletInfo(prev => ({ ...prev, derivationLoading: true }));

          // Import deriveXpubFromSeedPhrase from descriptorUtils
          const { deriveXpubFromSeedPhrase } = await import('@/utils/descriptorUtils');

          // Derive wallet info from seed phrase
          const { xpub, xpriv, fingerprint, path } = await deriveXpubFromSeedPhrase(seedPhrase);

          // Set wallet info
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
      await importWallet(inputSeedPhrase);
      setCreateSuccess(true); // Show success message
    } catch (err) {
      console.error('Error importing wallet:', err);
    }
  };

  // Show wallet dashboard if available
  if (hasWallet && seedPhrase) {
    return (
      <WalletDashboard
        seedPhrase={seedPhrase}
        walletInfo={walletInfo}
        createSuccess={createSuccess}
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
