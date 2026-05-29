'use client';

/**
 * WalletSetupWizard — orchestrates onboarding via a small explicit
 * state machine. Each step is a separate file under ./steps/.
 *
 * Branches:
 *
 *   welcome
 *     ├── create  → if PRF supported: choose
 *     │              ├── passkey  → passkeyEnroll → optionalBackup → init (Type 1)
 *     │              └── password → passwordSet → forcedBackup → init (Type 2)
 *     │           else: passwordSet → forcedBackup → init (Type 2)
 *     └── import  → importSeed → passwordSet → init (Type 2)
 *                                (passkey-import path skipped — for
 *                                 Type 2 we always use password; the
 *                                 user can later "delete + recreate"
 *                                 to switch to Type 1 with a fresh
 *                                 mnemonic if they want)
 *
 * No step is skippable. The state machine only advances on explicit
 * success callbacks.
 */

import { useState } from 'react';
import { useWallet } from '@/stores/walletStore';
import { useAuth } from '@/contexts/AuthContext';
import {
  isPrfSupported,
  generateRandomMnemonic,
  createPasswordWallet,
} from '@/services/auth';

import WelcomeStep from './steps/WelcomeStep';
import ChoosePathStep from './steps/ChoosePathStep';
import PasskeyEnrollStep from './steps/PasskeyEnrollStep';
import MnemonicBackupStep from './steps/MnemonicBackupStep';
import PasswordSetStep from './steps/PasswordSetStep';
import ImportSeedStep from './steps/ImportSeedStep';
import InitWalletStep from './steps/InitWalletStep';

const S = {
  WELCOME: 'welcome',
  CHOOSE: 'choose',
  PASSKEY_ENROLL: 'passkey-enroll',
  PASSWORD_SET: 'password-set',
  IMPORT_SEED: 'import-seed',
  BACKUP: 'backup',
  INIT: 'init',
};

export default function WalletSetupWizard({ presetSeed = null, presetType = null, extraAction = null }) {
  const { initializeWalletComplete } = useWallet();
  const { markUnlocked } = useAuth();

  const prfSupported = isPrfSupported();

  // Wizard state — explicit, no implicit shortcuts.
  const [step, setStep] = useState(presetSeed ? S.PASSWORD_SET : S.WELCOME);
  const [walletType, setWalletType] = useState(presetType);   // 'prf' | 'password'
  const [mnemonic, setMnemonic] = useState(presetSeed);
  const [password, setPassword] = useState(null);
  const [isImport, setIsImport] = useState(!!presetSeed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // --- transitions ---

  const goCreate = () => {
    setIsImport(false);
    if (prfSupported) setStep(S.CHOOSE);
    else { setWalletType('password'); setMnemonic(generateRandomMnemonic()); setStep(S.PASSWORD_SET); }
  };

  const goImport = () => {
    setIsImport(true);
    setStep(S.IMPORT_SEED);
  };

  const choosePasskey = () => {
    setWalletType('prf');
    setStep(S.PASSKEY_ENROLL);
  };

  const choosePassword = () => {
    setWalletType('password');
    setMnemonic(generateRandomMnemonic());
    setStep(S.PASSWORD_SET);
  };

  const onPasskeyEnrolled = (m) => {
    setMnemonic(m);
    setStep(S.BACKUP);
  };

  const onPasswordChosen = async (pwd) => {
    if (busy) return;
    setError(null);
    setBusy(true);
    setPassword(pwd);
    try {
      await createPasswordWallet({ mnemonic, password: pwd });
      // For Type 2 path: backup is mandatory only for fresh-create mnemonic.
      // For imports / legacy migration the user typed/already-had the seed;
      // we still surface the mnemonic so they can write it down again.
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

  // Backup acknowledged → flip to terminal init step AND fire the
  // address-derivation + sync. We start the async work directly here
  // (no effect, no eslint-disable) so the mnemonic closure is captured
  // explicitly at call time. InitWalletStep is terminal — nothing can
  // navigate away from it — so no cancellation is needed.
  const onBackupAck = () => {
    setStep(S.INIT);
    runInit(mnemonic);
  };

  // The back-target from PasswordSetStep depends on how we got here.
  // Imports came from the seed-paste screen; otherwise we came from
  // the welcome (no PRF) or the choose-path screen.
  const passwordSetBackStep = () => {
    if (isImport) return S.IMPORT_SEED;
    return prfSupported ? S.CHOOSE : S.WELCOME;
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
    return <WelcomeStep onCreate={goCreate} onImport={goImport} extraAction={extraAction} />;
  }
  if (step === S.CHOOSE) {
    return (
      <ChoosePathStep
        prfSupported={prfSupported}
        onPasskey={choosePasskey}
        onPassword={choosePassword}
        onBack={() => setStep(S.WELCOME)}
      />
    );
  }
  if (step === S.PASSKEY_ENROLL) {
    return <PasskeyEnrollStep onDone={onPasskeyEnrolled} onBack={() => setStep(S.CHOOSE)} />;
  }
  if (step === S.PASSWORD_SET) {
    return (
      <PasswordSetStep
        onSubmit={onPasswordChosen}
        onBack={() => { setError(null); setStep(passwordSetBackStep()); }}
        busy={busy}
        error={error}
      />
    );
  }
  if (step === S.IMPORT_SEED) {
    return <ImportSeedStep onSubmit={onImportSubmitted} onBack={() => setStep(S.WELCOME)} />;
  }
  if (step === S.BACKUP) {
    const required = walletType === 'password';  // Type 1 = optional, Type 2 = mandatory
    return <MnemonicBackupStep mnemonic={mnemonic} required={required} onContinue={onBackupAck} />;
  }
  return <InitWalletStep error={error} />;
}
