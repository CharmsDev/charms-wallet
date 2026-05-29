'use client';

/**
 * MigrationGate — blocking overlay for legacy users with a plaintext
 * seed in localStorage (pre-G003 production state).
 *
 * Condition to fire:
 *   hasWallet === true  AND
 *   seedPhrase !== null AND
 *   getWalletType() === null   (no v3 blob yet)
 *
 * Behaviour:
 *   Hands the existing plaintext mnemonic to the WalletSetupWizard's
 *   import branch (with the seed pre-loaded) so the user goes through
 *   PasswordSetStep → MnemonicBackupStep → init. The existing
 *   addresses are preserved (Type 2 encrypts the actual mnemonic).
 *
 *   The Type 1 (pure PRF) option is intentionally NOT offered here —
 *   it would change the mnemonic (and addresses) and brick the user's
 *   funds. They must delete the wallet manually if they want a fresh
 *   PRF wallet.
 *
 *   No skip / dismiss. Only escape: Delete Wallet (from a small link).
 */

import { useEffect, useState } from 'react';
import { useWallet } from '@/stores/walletStore';
import { getWalletType } from '@/services/auth';
import WalletSetupWizard from '@/components/wallet/setup/WalletSetupWizard';

export default function MigrationGate({ children }) {
  const { seedPhrase, hasWallet } = useWallet();
  const [needs, setNeeds] = useState(null);

  useEffect(() => {
    if (!hasWallet || !seedPhrase) { setNeeds(false); return; }
    let alive = true;
    (async () => {
      const type = await getWalletType();
      if (alive) setNeeds(!type);
    })();
    return () => { alive = false; };
  }, [hasWallet, seedPhrase]);

  if (needs === null) return null;   // checking
  if (!needs) return children;

  // Hand the existing mnemonic to the wizard. presetSeed routes it to
  // the import branch which uses Type 2 (password) and preserves
  // addresses.
  return <WalletSetupWizard presetSeed={seedPhrase} presetType="password" />;
}
