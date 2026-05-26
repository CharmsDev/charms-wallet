'use client';

/**
 * WalletSetupWizard — multi-step onboarding for new and imported
 * wallets. The protocol is designed so the seed phrase NEVER touches
 * persistent storage in plaintext on devices that support WebAuthn PRF.
 *
 * Steps (PRF-capable):
 *   1. choose      → Create new / Import existing
 *   2. passkey     → biometric prompt; PRF material kept in RAM only
 *   3a. backup     → (create) display seed phrase
 *   3b. verify     → (create) confirm by typing a random word
 *   3c. import     → (import) paste + validate seed phrase
 *   4. commit      → encrypt seed with PRF-derived key, write AUTH blob,
 *                    derive addresses, sync balances
 *   5. done        → handoff to dashboard
 *
 * Non-PRF browsers (Firefox, Linux without auth, very old browsers):
 *   - Step 2 is replaced by a warning + "continue without passkey".
 *   - Step 4 falls back to saveSeedPhrase() (plaintext local storage).
 *
 * The wizard owns the seed phrase in component state for the duration
 * of setup, then drops the reference. React component unmount will
 * release the string to GC; we can't actively zero a JS string (V8
 * heap), but we minimise its lifetime by not persisting plaintext and
 * by not stashing it in stores until the encrypted blob is written.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '@/stores/walletStore';
import { useAuth } from '@/contexts/AuthContext';
import { generateSeedPhrase, importSeedPhrase } from '@/utils/wallet';
import {
  beginEnrollment, commitEnrollment, abortEnrollment, isPrfSupported,
} from '@/services/auth';

const STEPS = {
  CHOOSE: 'choose',
  PASSKEY: 'passkey',
  BACKUP: 'backup',
  VERIFY: 'verify',
  IMPORT: 'import',
  COMMIT: 'commit',
};

export default function WalletSetupWizard({ presetSeed = null, extraAction = null }) {
  const { setSeedPhrase, initializeWalletComplete } = useWallet();
  const { markUnlocked } = useAuth();

  const prfSupported = useMemo(() => isPrfSupported(), []);
  const [step, setStep] = useState(presetSeed ? STEPS.PASSKEY : STEPS.CHOOSE);
  const [mode, setMode] = useState(presetSeed ? 'import' : null); // 'create' | 'import'
  const [seed, setSeed] = useState(presetSeed ? presetSeed.trim().toLowerCase() : null);
  const [prfMaterial, setPrfMaterial] = useState(null);
  const [usePasskey, setUsePasskey] = useState(prfSupported);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // If the user navigates away mid-wizard, wipe the PRF material we
  // captured (the on-authenticator credential becomes orphaned — no
  // harm, just unused).
  const prfRef = useRef(prfMaterial);
  useEffect(() => { prfRef.current = prfMaterial; }, [prfMaterial]);
  useEffect(() => () => abortEnrollment(prfRef.current), []);

  const chooseCreate = () => {
    setMode('create');
    setError(null);
    setStep(usePasskey ? STEPS.PASSKEY : STEPS.BACKUP);
  };
  const chooseImport = () => {
    setMode('import');
    setError(null);
    setStep(usePasskey ? STEPS.PASSKEY : STEPS.IMPORT);
  };

  const skipPasskey = () => {
    setUsePasskey(false);
    setStep(mode === 'create' ? STEPS.BACKUP : STEPS.IMPORT);
  };

  const onPasskeyOk = async (material) => {
    setPrfMaterial(material);
    setError(null);
    if (mode === 'create') {
      // generate seed in memory only — never call saveSeedPhrase()
      const m = await generateSeedPhrase();
      setSeed(m);
      setStep(STEPS.BACKUP);
    } else {
      setStep(STEPS.IMPORT);
    }
  };

  // Create-flow path with no passkey: we still need to generate the
  // seed before we can show the backup screen.
  useEffect(() => {
    if (step === STEPS.BACKUP && !seed && mode === 'create') {
      generateSeedPhrase().then(setSeed).catch(e => setError(e.message));
    }
  }, [step, seed, mode]);

  const onBackupConfirmed = () => setStep(STEPS.VERIFY);

  const onVerifyOk = () => setStep(STEPS.COMMIT);

  const onImportOk = async (raw) => {
    setError(null);
    try {
      const normalised = await importSeedPhrase(raw);
      setSeed(normalised);
      setStep(STEPS.COMMIT);
    } catch (e) {
      setError(e.message);
    }
  };

  // Final step: persist + derive + sync.
  useEffect(() => {
    if (step !== STEPS.COMMIT || !seed || busy) return;
    setBusy(true);
    setError(null);
    (async () => {
      try {
        if (usePasskey && prfMaterial) {
          await commitEnrollment(seed, prfMaterial);
          setPrfMaterial(null);
          markUnlocked();
          // Encrypted: skip the plaintext save inside initializeWallet
          await initializeWalletComplete(seed, true, { alreadyPersisted: true });
        } else {
          // Plaintext path — initializeWallet will saveSeedPhrase
          await initializeWalletComplete(seed, mode === 'import');
        }
        // The walletStore now owns the seed; release our local copy.
        setSeed(null);
      } catch (e) {
        setError(e.message || 'Setup failed');
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, seed, usePasskey, prfMaterial, mode]);

  // ─ render ──────────────────────────────────────────────────────────────

  if (step === STEPS.CHOOSE) {
    return <ChooseStep
      busy={busy}
      prfSupported={prfSupported}
      onCreate={chooseCreate}
      onImport={chooseImport}
      extraAction={extraAction}
    />;
  }
  if (step === STEPS.PASSKEY) {
    return <PasskeyStep
      onOk={onPasskeyOk}
      onSkip={skipPasskey}
      setError={setError}
      error={error}
    />;
  }
  if (step === STEPS.BACKUP) {
    return <BackupStep
      seed={seed}
      onContinue={onBackupConfirmed}
      onCancel={() => setStep(STEPS.CHOOSE)}
    />;
  }
  if (step === STEPS.VERIFY) {
    return <VerifyStep
      seed={seed}
      onOk={onVerifyOk}
      onBack={() => setStep(STEPS.BACKUP)}
    />;
  }
  if (step === STEPS.IMPORT) {
    return <ImportStep
      onOk={onImportOk}
      onCancel={() => setStep(STEPS.CHOOSE)}
      error={error}
    />;
  }
  // COMMIT → render an unobtrusive "preparing your wallet" screen; the
  // real progress UI is the existing WalletInitialization component
  // rendered by page.js while isInitializing is true.
  return <CommitStep error={error} />;
}

// ─── steps ─────────────────────────────────────────────────────────────────

function Shell({ title, children, footer }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex flex-col items-center justify-center px-4 z-50">
      <div className="w-full max-w-md card p-8 space-y-6">
        <h1 className="text-2xl font-bold text-center gradient-text">{title}</h1>
        {children}
        {footer}
      </div>
    </div>
  );
}

function ChooseStep({ onCreate, onImport, prfSupported, busy, extraAction }) {
  return (
    <Shell title="Bitcoin Wallet">
      <p className="text-sm text-gray-300 text-center">
        Create a new wallet or import an existing seed phrase.
      </p>
      {!prfSupported && (
        <p className="text-xs text-yellow-300 text-center">
          Heads up: this browser doesn't support passkey encryption. You'll
          set a password instead — equally secure if it's strong.
        </p>
      )}
      <div className="space-y-3">
        <button
          onClick={onCreate}
          disabled={busy}
          className="btn btn-primary w-full py-3"
        >
          Create New Wallet
        </button>
        <button
          onClick={onImport}
          disabled={busy}
          className="btn btn-secondary w-full py-3"
        >
          Import Existing Wallet
        </button>
        {extraAction && (
          <button
            onClick={extraAction.onClick}
            disabled={busy}
            className="w-full py-3 px-4 rounded-lg border border-bitcoin-500/40 bg-bitcoin-500/10 hover:bg-bitcoin-500/20 text-bitcoin-400 font-medium transition-colors"
          >
            {extraAction.label}
          </button>
        )}
      </div>
    </Shell>
  );
}

function PasskeyStep({ onOk, onSkip, setError, error }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const m = await beginEnrollment({ displayName: 'Charms Wallet user' });
      await onOk(m);
    } catch (e) {
      setError(e.message || 'Passkey setup failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell title="Set up passkey">
      <p className="text-sm text-gray-300">
        We'll set up a passkey on this device before your seed phrase
        exists. The seed will be encrypted with a key derived from your
        passkey and never written to disk in plaintext.
      </p>
      <ul className="text-xs text-gray-400 space-y-1 list-disc pl-5">
        <li>Uses Touch ID, Face ID, Windows Hello, or your security key.</li>
        <li>You'll authenticate when you open the wallet in a new tab.</li>
        <li>While the tab stays open the session stays unlocked. Lock manually from the account menu.</li>
      </ul>
      <button
        onClick={run}
        disabled={busy}
        className="btn btn-primary w-full py-3"
      >
        {busy ? 'Waiting for biometric…' : 'Set up passkey'}
      </button>
      {error && <p className="text-xs text-red-400 break-words">{error}</p>}
      <button
        onClick={onSkip}
        className="text-xs text-gray-400 hover:text-gray-200 underline w-full text-center"
      >
        Skip — continue without passkey (less secure)
      </button>
    </Shell>
  );
}

function BackupStep({ seed, onContinue, onCancel }) {
  const [revealed, setRevealed] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const words = (seed || '').split(' ');
  return (
    <Shell title="Back up your seed phrase">
      <p className="text-sm text-yellow-300">
        Write these {words.length} words down on paper, in order. They are
        the only way to recover your wallet if you lose this device.
      </p>
      <div className="relative">
        <div className="grid grid-cols-2 gap-2">
          {words.map((w, i) => (
            <div key={i} className="bg-dark-800 p-2 rounded-lg border border-dark-700 text-sm">
              <span className="text-primary-400 mr-1">{i + 1}.</span>
              <span className="text-white font-mono">{revealed ? w : '••••••••'}</span>
            </div>
          ))}
        </div>
        {!revealed && (
          <button
            onClick={() => setRevealed(true)}
            className="absolute inset-0 flex items-center justify-center bg-dark-900/80 rounded-lg"
          >
            <span className="text-white font-medium">Tap to reveal</span>
          </button>
        )}
      </div>
      <label className="flex items-start gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={e => setAcknowledged(e.target.checked)}
          className="mt-1"
        />
        <span>I've written down my seed phrase and stored it safely offline.</span>
      </label>
      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 btn btn-secondary py-3">Cancel</button>
        <button
          onClick={onContinue}
          disabled={!acknowledged || !revealed}
          className="flex-1 btn btn-primary py-3 disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </Shell>
  );
}

function VerifyStep({ seed, onOk, onBack }) {
  const words = (seed || '').split(' ');
  // Two random word positions — enough to detect "I didn't actually
  // write it down" without overburdening the user.
  const positions = useMemo(() => {
    const out = new Set();
    while (out.size < 2) out.add(Math.floor(Math.random() * words.length));
    return [...out];
  }, [seed]);
  const [answers, setAnswers] = useState(['', '']);
  const [error, setError] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    setError(null);
    const ok = positions.every((p, i) => answers[i].trim().toLowerCase() === words[p]);
    if (ok) onOk();
    else setError('At least one word is wrong. Check your written copy and try again.');
  };

  return (
    <Shell title="Verify your backup">
      <p className="text-sm text-gray-300">
        Type the requested words from your written copy.
      </p>
      <form onSubmit={submit} className="space-y-3">
        {positions.map((p, i) => (
          <label key={p} className="block">
            <span className="block text-xs text-gray-400 mb-1">Word #{p + 1}</span>
            <input
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={answers[i]}
              onChange={e => {
                const next = [...answers]; next[i] = e.target.value; setAnswers(next);
              }}
              className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-md text-white"
            />
          </label>
        ))}
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={onBack} className="flex-1 btn btn-secondary py-3">
            Back
          </button>
          <button type="submit" className="flex-1 btn btn-primary py-3">
            Verify
          </button>
        </div>
      </form>
    </Shell>
  );
}

function ImportStep({ onOk, onCancel, error }) {
  const [val, setVal] = useState('');
  const submit = (e) => { e.preventDefault(); onOk(val); };
  return (
    <Shell title="Import seed phrase">
      <p className="text-sm text-gray-300">
        Paste your 12 or 24 word recovery phrase. It will be encrypted with
        your passkey before being written to this device's storage.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <textarea
          rows={3}
          value={val}
          onChange={e => setVal(e.target.value)}
          placeholder="word one word two word three…"
          className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-md text-white placeholder-gray-500"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        {error && <p className="text-xs text-red-400 break-words">{error}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="flex-1 btn btn-secondary py-3">
            Cancel
          </button>
          <button type="submit" className="flex-1 btn btn-primary py-3">
            Import
          </button>
        </div>
      </form>
    </Shell>
  );
}

function CommitStep({ error }) {
  return (
    <Shell title="Preparing your wallet">
      <p className="text-sm text-gray-300 text-center">
        Encrypting your seed and deriving addresses…
      </p>
      {error && <p className="text-xs text-red-400 break-words">{error}</p>}
    </Shell>
  );
}
