'use client';

/**
 * WalletSetupWizard — orchestrates onboarding via a small explicit
 * state machine. Each step is a separate file under ./steps/.
 *
 * Entry branches (deterministic on local state — `isEnrolled()`):
 *
 *   isEnrolled === true              → unlock (caso A)
 *     → restorePrfWallet's mnemonic captured in walletStore → markUnlocked
 *
 *   isEnrolled === false             → create (caso B)
 *     → createPrfWallet → backup → init (Type 1)
 *     opt-in branches:
 *       - "Restore from another device"  → prf-access (discovery + QR)
 *       - "Import seed phrase"           → importSeed → passwordSet → init
 *                                          (Type 2, no backup screen — user
 *                                          already has the seed)
 *
 * Migration path (legacy plaintext user) bypasses the entry branch
 * and lands directly on passwordSet with `presetSeed` + `isMigration=true`.
 *
 * No step is skippable. The state machine only advances on explicit
 * success callbacks.
 */

import { useState, useEffect } from 'react';
import { useWallet } from '@/stores/walletStore';
import { useAuth } from '@/contexts/AuthContext';
import { clearSeedPhrase } from '@/services/storage';
import {
  isPrfSupported,
  isEnrolled,
  createPasswordWallet,
} from '@/services/auth';

import UnlockStep from './steps/UnlockStep';
import CreateStep from './steps/CreateStep';
import PrfAccessStep from './steps/PrfAccessStep';
import MnemonicBackupStep from './steps/MnemonicBackupStep';
import PasswordSetStep from './steps/PasswordSetStep';
import ImportSeedStep from './steps/ImportSeedStep';
import InitWalletStep from './steps/InitWalletStep';
import SetupShell from './steps/SetupShell';

const S = {
  CHECKING:    'checking',     // resolving isEnrolled() on mount
  UNLOCK:      'unlock',       // caso A: blob present, biometric only
  CREATE:      'create',       // caso B: no blob, fresh passkey
  PRF_ACCESS:  'prf-access',   // opt-in restore from another device (discoverable get)
  PASSWORD_SET:'password-set',
  IMPORT_SEED: 'import-seed',
  BACKUP:      'backup',
  INIT:        'init',
};

export default function WalletSetupWizard({ presetSeed = null, presetType = null, extraAction = null, isMigration = false }) {
  const { initializeWalletComplete, setSeedPhrase } = useWallet();
  const { markUnlocked } = useAuth();

  const prfSupported = isPrfSupported();

  // Initial step: migration short-circuits to PASSWORD_SET. Everything
  // else starts in CHECKING and resolves to UNLOCK or CREATE based on
  // the local blob.
  const [step, setStep] = useState(presetSeed ? S.PASSWORD_SET : S.CHECKING);
  const [walletType, setWalletType] = useState(presetType);   // 'prf' | 'password'
  const [mnemonic, setMnemonic] = useState(presetSeed);
  const [isImport, setIsImport] = useState(!!presetSeed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Resolve the entry branch from local storage.
  useEffect(() => {
    if (step !== S.CHECKING) return;
    let alive = true;
    isEnrolled()
      .then((enrolled) => {
        if (!alive) return;
        setStep(enrolled ? S.UNLOCK : S.CREATE);
      })
      .catch(() => { if (alive) setStep(S.CREATE); });
    return () => { alive = false; };
  }, [step]);

  // --- transitions ---

  // Caso A unlock — got mnemonic from existing passkey. Skip backup
  // (the user already has a wallet and presumably backed up at create
  // time) and skip init (addresses survived from last session via
  // storage). Just hand the seed to walletStore and unlock.
  const onUnlocked = async (m) => {
    try {
      setSeedPhrase?.(m);
      await markUnlocked();
    } catch (e) {
      setError(e.message || 'Failed to finalize unlock');
    }
  };

  const onCreatedPrf = (m) => {
    setIsImport(false);
    setWalletType('prf');
    setMnemonic(m);
    setStep(S.BACKUP);
  };

  const goRestore = () => {
    setIsImport(false);
    setWalletType('prf');
    setStep(S.PRF_ACCESS);
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
      await clearSeedPhrase();
      // Import flow (user already has the seed): skip the backup
      // reminder and go straight to wallet init. Migration still
      // routes through BACKUP because it doubles as the migration
      // ack screen.
      if (isImport && !isMigration) {
        setStep(S.INIT);
        runInit(mnemonic);
      } else {
        setStep(S.BACKUP);
      }
    } catch (e) {
      setError(e.message || 'Encryption failed');
    } finally {
      setBusy(false);
    }
  };

  const onImportSubmitted = (m) => {
    setWalletType('password');
    setMnemonic(m);
    setStep(S.PASSWORD_SET);
  };

  // Backup acknowledged. Migration short-circuits init (addresses
  // already exist); fresh wallets run initializeWalletComplete.
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
      setMnemonic(null);
    } catch (e) {
      setError(e.message || 'Wallet initialization failed');
    }
  };

  // --- render ---

  if (step === S.CHECKING) {
    return (
      <SetupShell>
        <p className="text-sm text-dark-300 text-center">Loading…</p>
      </SetupShell>
    );
  }

  if (step === S.UNLOCK) {
    return (
      <UnlockStep
        onDone={onUnlocked}
        onRestore={goRestore}
        onImport={goImport}
      />
    );
  }

  if (step === S.CREATE) {
    return (
      <CreateStep
        prfSupported={prfSupported}
        onDone={onCreatedPrf}
        onRestore={goRestore}
        onImport={goImport}
      />
    );
  }

  if (step === S.PRF_ACCESS) {
    return <PrfAccessStep onDone={onPrfDone} onBack={() => setStep(walletType === 'prf' ? S.UNLOCK : S.CREATE)} />;
  }

  if (step === S.IMPORT_SEED) {
    return <ImportSeedStep onSubmit={onImportSubmitted} onBack={() => setStep(S.CREATE)} />;
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
    const required = walletType === 'password';  // Type 1 optional, Type 2 mandatory
    return <MnemonicBackupStep mnemonic={mnemonic} required={required} onContinue={onBackupAck} />;
  }

  return <InitWalletStep error={error} />;
}
