'use client';

/**
 * WalletSetupWizard — orchestrates onboarding via a small explicit
 * state machine. Each step is a separate file under ./steps/.
 *
 * Branches (post-G003 simplification):
 *
 *   welcome
 *     ├── passkey  → prf-access (try restore via discoverable creds;
 *     │              if user cancels / no creds, prompt: try again /
 *     │              create new) → optionalBackup → init (Type 1)
 *     │
 *     └── import   → importSeed → passwordSet → forcedBackup
 *                                              → init (Type 2)
 *
 * Migration path (legacy plaintext user) bypasses welcome and lands
 * directly on passwordSet with `presetSeed` + `isMigration=true`.
 *
 * No step is skippable. The state machine only advances on explicit
 * success callbacks.
 */

import { useState } from 'react';
import { useWallet } from '@/stores/walletStore';
import { useAuth } from '@/contexts/AuthContext';
import { clearSeedPhrase } from '@/services/storage';
import {
  isPrfSupported,
  createPasswordWallet,
} from '@/services/auth';

import WelcomeStep from './steps/WelcomeStep';
import PrfCreateStep from './steps/PrfCreateStep';
import PrfRestoreStep from './steps/PrfRestoreStep';
import MnemonicBackupStep from './steps/MnemonicBackupStep';
import PasswordSetStep from './steps/PasswordSetStep';
import ImportSeedStep from './steps/ImportSeedStep';
import InitWalletStep from './steps/InitWalletStep';

const S = {
  WELCOME: 'welcome',
  PRF_CREATE: 'prf-create',     // first-time setup on this device
  PRF_RESTORE: 'prf-restore',   // discover synced passkey from another device
  PASSWORD_SET: 'password-set',
  IMPORT_SEED: 'import-seed',
  BACKUP: 'backup',
  INIT: 'init',
};

export default function WalletSetupWizard({ presetSeed = null, presetType = null, extraAction = null, isMigration = false }) {
  const { initializeWalletComplete } = useWallet();
  const { markUnlocked } = useAuth();

  const prfSupported = isPrfSupported();

  // Wizard state — explicit, no implicit shortcuts.
  const [step, setStep] = useState(presetSeed ? S.PASSWORD_SET : S.WELCOME);
  const [walletType, setWalletType] = useState(presetType);   // 'prf' | 'password'
  const [mnemonic, setMnemonic] = useState(presetSeed);
  const [isImport, setIsImport] = useState(!!presetSeed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // --- transitions ---

  const goCreate = () => {
    setIsImport(false);
    setWalletType('prf');
    setStep(S.PRF_CREATE);
  };

  const goRestore = () => {
    setIsImport(false);
    setWalletType('prf');
    setStep(S.PRF_RESTORE);
  };

  const goImport = () => {
    setIsImport(true);
    setStep(S.IMPORT_SEED);
  };

  const onPrfDone = (m) => {
    setMnemonic(m);
    setStep(S.BACKUP);
  };

  const onPasswordChosen = async (pwd) => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await createPasswordWallet({ mnemonic, password: pwd });
      // CRITICAL: with the encrypted blob now committed, wipe any
      // residual plaintext seed in storage (matters for legacy
      // migration; no-op for fresh import).
      await clearSeedPhrase();
      setStep(S.BACKUP);
    } catch (e) {
      setError(e.message || 'Encryption failed');
    } finally {
      setBusy(false);
    }
  };

  const onImportSubmitted = (m) => {
    setWalletType('password');     // imports always go Type 2
    setMnemonic(m);
    setStep(S.PASSWORD_SET);
  };

  // Backup acknowledged. Two distinct paths:
  //
  // (a) Migration — the wallet already existed in this device. Its
  //     addresses, UTXOs and caches survive intact in localStorage;
  //     the only thing that changed is the seed went from plaintext
  //     to encrypted. We skip the Init step entirely: markUnlocked()
  //     flips auth state, MigrationGate stops blocking, the dashboard
  //     mounts with the seed already in RAM. NO re-derivation, NO
  //     re-sync, NO password re-prompt.
  //
  // (b) Fresh create / import — no addresses exist yet, so we run
  //     initializeWalletComplete() to derive and sync, then
  //     markUnlocked.
  const onBackupAck = async () => {
    if (step === S.INIT) return;
    if (isMigration) {
      try {
        await markUnlocked();
        setMnemonic(null);
      } catch (e) {
        setError(e.message || 'Failed to finalize migration');
      }
      return;
    }
    setStep(S.INIT);
    runInit(mnemonic);
  };

  const runInit = async (seed) => {
    if (!seed) return;
    try {
      await initializeWalletComplete(seed, true, { alreadyPersisted: true });
      await markUnlocked();
      setMnemonic(null);   // release wizard copy; walletStore owns it now
    } catch (e) {
      setError(e.message || 'Wallet initialization failed');
    }
  };

  // --- render ---

  if (step === S.WELCOME) {
    return (
      <WelcomeStep
        onCreate={goCreate}
        onRestore={goRestore}
        onImport={goImport}
        prfSupported={prfSupported}
        extraAction={extraAction}
      />
    );
  }
  if (step === S.PRF_CREATE) {
    return <PrfCreateStep onDone={onPrfDone} onBack={() => setStep(S.WELCOME)} />;
  }
  if (step === S.PRF_RESTORE) {
    return <PrfRestoreStep onDone={onPrfDone} onBack={() => setStep(S.WELCOME)} />;
  }
  if (step === S.IMPORT_SEED) {
    return <ImportSeedStep onSubmit={onImportSubmitted} onBack={() => setStep(S.WELCOME)} />;
  }
  if (step === S.PASSWORD_SET) {
    return (
      <PasswordSetStep
        onSubmit={onPasswordChosen}
        onBack={isMigration ? null : () => { setError(null); setStep(S.IMPORT_SEED); }}
        busy={busy}
        error={error}
        isMigration={isMigration}
      />
    );
  }
  if (step === S.BACKUP) {
    const required = walletType === 'password';  // Type 1 = optional, Type 2 = mandatory
    return <MnemonicBackupStep mnemonic={mnemonic} required={required} onContinue={onBackupAck} />;
  }
  return <InitWalletStep error={error} />;
}
