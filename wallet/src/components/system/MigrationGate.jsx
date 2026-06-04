'use client';

/**
 * MigrationGate — blocking overlay for legacy users with a plaintext
 * seed in localStorage (pre-G003 production state).
 *
 * Condition to fire:
 *   hasWallet === true  AND
 *   seedPhrase !== null AND
 *   walletType === null   (no v3 blob yet)
 *
 * walletType comes from AuthContext, which reads the blob on mount
 * and exposes it as state. After the migration wizard writes the v3
 * blob and calls markUnlocked(), walletType flips to 'password' and
 * this gate stops blocking — without needing a manual onDone wire.
 *
 * The wizard's `isMigration` flag short-circuits the post-backup
 * Init step: addresses + UTXOs + charm caches survive intact in
 * localStorage (the only thing that changed is the seed went from
 * plaintext to encrypted). Re-deriving and re-syncing would be
 * redundant work and confusing UX ("Preparing your wallet" for an
 * existing wallet makes no sense).
 *
 * No skip / dismiss. Only escape: Delete Wallet from a small link.
 */

import { useWallet } from '@/stores/walletStore';
import { useAuth } from '@/contexts/AuthContext';
import WalletSetupWizard from '@/components/wallet/setup/WalletSetupWizard';

export default function MigrationGate({ children }) {
  const { seedPhrase, hasWallet } = useWallet();
  const { status, walletType } = useAuth();

  // While AuthContext is still probing storage, render nothing — same
  // pattern as UnlockGate. Prevents a brief flash of the wizard before
  // the blob-detection finishes.
  if (status === 'checking') return null;

  const needs = hasWallet && !!seedPhrase && !walletType;
  if (!needs) return children;

  return <WalletSetupWizard presetSeed={seedPhrase} presetType="password" isMigration />;
}
