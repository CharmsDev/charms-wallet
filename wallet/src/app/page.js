'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@/stores/walletStore';
import { useAddresses } from '@/stores/addressesStore';
import { generateInitialBitcoinAddresses } from '@/utils/addressUtils';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import WalletCreation from '@/components/wallet/setup/WalletCreation';
import WalletDashboard from '@/components/wallet/setup/WalletDashboard';

// Initialize bitcoinjs-lib with ECC
bitcoin.initEccLib(ecc);

export default function Home() {
  const { hasWallet, seedPhrase, isLoading, error, createWallet, importWallet } = useWallet();
  const { addresses, addMultipleAddresses } = useAddresses();
  const [createSuccess, setCreateSuccess] = useState(false);
  const [walletInfo, setWalletInfo] = useState({
    xpub: '',
    xpriv: '',
    fingerprint: '',
    path: '86h/0h/0h',
    derivationLoading: false
  });

  // Derive wallet info and generate initial addresses
  useEffect(() => {
    const setupWallet = async () => {
      if (hasWallet && seedPhrase) {
        try {
          setWalletInfo(prev => ({ ...prev, derivationLoading: true }));
          const { deriveXpubFromSeedPhrase } = await import('@/utils/descriptorUtils');
          const { xpub, xpriv, fingerprint, path } = await deriveXpubFromSeedPhrase(seedPhrase);
          setWalletInfo({ xpub, xpriv, fingerprint, path, derivationLoading: false });

          if (addresses.length === 0) {
            const initialAddresses = await generateInitialBitcoinAddresses(seedPhrase);
            console.log('Saving addresses to storage...');
            await addMultipleAddresses(initialAddresses);
            console.log('Addresses saved.');
          }
        } catch (error) {
          console.error("Failed to setup wallet:", error);
          setWalletInfo(prev => ({ ...prev, derivationLoading: false }));
        }
      }
    };

    setupWallet();
  }, [hasWallet, seedPhrase, addresses.length, addMultipleAddresses]);

  const handleCreateWallet = async () => {
    try {
      await createWallet();
      setCreateSuccess(true);
    } catch (err) {
      // Error creating wallet
    }
  };

  const handleImportWallet = async (inputSeedPhrase) => {
    try {
      await importWallet(inputSeedPhrase);
      setCreateSuccess(true); // Show success message
    } catch (err) {
      // Error importing wallet
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
