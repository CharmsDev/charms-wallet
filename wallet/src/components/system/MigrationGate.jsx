'use client';

/**
 * MigrationGate — blocking overlay shown to legacy users whose seed
 * phrase is still in plaintext storage. Renders when:
 *   hasWallet === true AND seedPhrase !== null AND no auth blob exists
 *
 * The user MUST choose either passkey (PRF-capable browsers) or
 * password (universal fallback) before reaching the dashboard. There
 * is no "skip" / "remind me later" — the only escape is deleting the
 * wallet, which is gated behind a separate destructive confirm.
 *
 * On success the seed is encrypted, the plaintext copy is wiped from
 * storage, and the gate lifts. The seed stays in RAM via walletStore
 * so the user is not re-prompted on the same tab.
 */

import { useEffect, useState } from 'react';
import { useWallet } from '@/stores/walletStore';
import { useAuth } from '@/contexts/AuthContext';
import {
  beginEnrollment, commitEnrollment, abortEnrollment,
  enrollPassword, isPrfSupported, getAuthMethod, validatePassword,
} from '@/services/auth';
import { clearSeedPhrase } from '@/services/storage';
import DeleteWalletDialog from '@/components/system/DeleteWalletDialog';

const MODE = {
  BACKUP: 'backup',     // forced seed-phrase backup acknowledgement first
  CHOOSE: 'choose',
  PASSKEY: 'passkey',
  PASSWORD: 'password',
};

export default function MigrationGate({ children }) {
  const { seedPhrase, hasWallet } = useWallet();
  const [needs, setNeeds] = useState(null); // null = checking, true/false = decided

  useEffect(() => {
    if (!hasWallet || !seedPhrase) { setNeeds(false); return; }
    let alive = true;
    (async () => {
      const method = await getAuthMethod();
      if (!alive) return;
      setNeeds(!method); // needs migration iff no blob present
    })();
    return () => { alive = false; };
  }, [hasWallet, seedPhrase]);

  if (needs === null) return null;        // checking — render nothing briefly
  if (!needs) return children;             // already encrypted / no wallet

  return <Gate onDone={() => setNeeds(false)} seedPhrase={seedPhrase} />;
}

// ─── Gate UI ───────────────────────────────────────────────────────────────

function Gate({ seedPhrase, onDone }) {
  const { markUnlocked } = useAuth();
  // Always start with the forced backup step. Legacy users may never
  // have looked at the seed phrase — we cannot assume they have a
  // copy, and once they pick an encryption method there is no recovery
  // from a lost passkey/password without the written seed.
  const [mode, setMode] = useState(MODE.BACKUP);
  const [showDelete, setShowDelete] = useState(false);
  const prfSupported = isPrfSupported();

  const finish = async () => {
    await clearSeedPhrase();
    await markUnlocked();
    onDone();
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-start sm:items-center justify-center bg-dark-950/95 backdrop-blur-sm overflow-y-auto py-12">
      <div className="w-full max-w-md mx-4 my-auto bg-dark-900 rounded-2xl border border-white/10 p-6 sm:p-8 space-y-6">
        <div>
          <h2 className="text-xl font-bold gradient-text">Secure your wallet</h2>
          <p className="text-sm text-dark-300 mt-2">
            Your seed phrase is currently stored unencrypted on this device.
            We're rolling out an encryption layer for everyone.
          </p>
        </div>

        {mode === MODE.BACKUP && (
          <BackupStep
            seedPhrase={seedPhrase}
            onContinue={() => setMode(MODE.CHOOSE)}
          />
        )}

        {mode === MODE.CHOOSE && (
          <ChooseStep
            prfSupported={prfSupported}
            onPasskey={() => setMode(MODE.PASSKEY)}
            onPassword={() => setMode(MODE.PASSWORD)}
            onBack={() => setMode(MODE.BACKUP)}
          />
        )}

        {mode === MODE.PASSKEY && (
          <PasskeyStep
            seedPhrase={seedPhrase}
            onCancel={() => setMode(MODE.CHOOSE)}
            onSuccess={finish}
          />
        )}

        {mode === MODE.PASSWORD && (
          <PasswordStep
            seedPhrase={seedPhrase}
            onCancel={() => setMode(MODE.CHOOSE)}
            onSuccess={finish}
          />
        )}

        <div className="pt-3 border-t border-dark-700 text-center">
          <button
            type="button"
            onClick={() => setShowDelete(true)}
            className="text-xs text-dark-500 hover:text-red-400 underline"
          >
            I just want to delete this wallet
          </button>
        </div>
      </div>

      <DeleteWalletDialog isOpen={showDelete} onClose={() => setShowDelete(false)} />
    </div>
  );
}

function BackupStep({ seedPhrase, onContinue }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [ack, setAck] = useState(false);
  const words = (seedPhrase || '').split(' ');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(seedPhrase);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (_) {}
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3">
        <p className="text-sm text-red-300 font-medium">
          ⚠️ Read this carefully — there is no recovery from a lost
          passkey/password without your seed phrase.
        </p>
        <p className="text-xs text-red-200/80 mt-2 leading-relaxed">
          After you encrypt, the plaintext seed on this device is wiped.
          If you lose the passkey (broken device, OS reset) or forget the
          password, the <span className="font-semibold">only</span> way to
          recover this wallet is the {words.length}-word seed phrase
          below. Write it on paper and store it offline before continuing.
        </p>
      </div>

      <div className="relative">
        <div className="grid grid-cols-2 gap-2">
          {words.map((w, i) => (
            <div key={i} className="bg-dark-800 p-2 rounded-lg border border-dark-700 text-xs">
              <span className="text-primary-400 mr-1">{i + 1}.</span>
              <span className="text-white font-mono">{revealed ? w : '••••••••'}</span>
            </div>
          ))}
        </div>
        {!revealed && (
          <button
            onClick={() => setRevealed(true)}
            className="absolute inset-0 flex items-center justify-center bg-dark-900/90 rounded-lg"
          >
            <span className="text-white font-medium text-sm">Tap to reveal seed phrase</span>
          </button>
        )}
      </div>

      {revealed && (
        <button
          onClick={copy}
          className="w-full py-2 rounded bg-dark-700 hover:bg-dark-600 text-white text-sm"
        >
          {copied ? '✓ Copied to clipboard' : 'Copy seed phrase'}
        </button>
      )}

      <label className="flex items-start gap-2 text-sm text-dark-200">
        <input
          type="checkbox"
          checked={ack}
          onChange={e => setAck(e.target.checked)}
          className="mt-1"
        />
        <span>
          I have saved my seed phrase offline. I understand that losing
          both this device's passkey/password <span className="font-semibold">and</span>{' '}
          this written backup means losing my wallet permanently.
        </span>
      </label>

      <button
        onClick={onContinue}
        disabled={!ack || !revealed}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-primary-500 to-blue-500 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
      >
        I've backed up my seed — continue
      </button>
    </div>
  );
}

function ChooseStep({ prfSupported, onPasskey, onPassword, onBack }) {
  return (
    <div className="space-y-3">
      <button
        onClick={onPasskey}
        disabled={!prfSupported}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-primary-500 to-blue-500 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Use a passkey {prfSupported ? '(recommended)' : '(not supported here)'}
      </button>
      {!prfSupported && (
        <p className="text-[11px] text-yellow-300 -mt-1">
          This browser doesn't support the WebAuthn PRF extension. Use a
          password, or try the latest Chrome/Safari/Edge on a device with
          a biometric authenticator.
        </p>
      )}
      <button
        onClick={onPassword}
        className="w-full py-3 rounded-xl bg-dark-700 hover:bg-dark-600 text-white font-medium"
      >
        Use a password
      </button>
      <button
        type="button"
        onClick={onBack}
        className="text-xs text-dark-400 hover:text-dark-200 underline"
      >
        ← Show seed phrase again
      </button>
    </div>
  );
}

function SeedRecoveryNote() {
  return (
    <p className="text-[11px] text-dark-400 leading-relaxed pt-2">
      Either method only encrypts the seed on this device. Your written
      seed phrase remains the universal recovery — it works on any wallet
      software, on any device, regardless of this setting.
    </p>
  );
}

function PasskeyStep({ seedPhrase, onCancel, onSuccess }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const run = async () => {
    if (busy) return;
    setBusy(true); setErr(null);
    let material;
    try {
      material = await beginEnrollment({ displayName: 'Charms Wallet user' });
      await commitEnrollment(seedPhrase, material);
      material = null;
      await onSuccess();
    } catch (e) {
      abortEnrollment(material);
      setErr(e.message || 'Passkey setup failed');
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-dark-200">
        Press the button below and authenticate with your device biometric
        (Touch ID, Face ID, Windows Hello, etc.). The seed will be
        encrypted with a key derived from your passkey and the plaintext
        copy will be deleted.
      </p>
      <button
        onClick={run}
        disabled={busy}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-primary-500 to-blue-500 text-white font-semibold disabled:opacity-50"
      >
        {busy ? 'Waiting for biometric…' : 'Set up passkey'}
      </button>
      {err && <p className="text-xs text-red-400 break-words">{err}</p>}
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="text-xs text-dark-400 hover:text-dark-200 underline disabled:opacity-50"
      >
        ← Back
      </button>
    </div>
  );
}

function PasswordStep({ seedPhrase, onCancel, onSuccess }) {
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const check = validatePassword(pwd);
  const matches = pwd && pwd === confirm;
  const canSubmit = check.ok && matches && !busy;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true); setErr(null);
    try {
      await enrollPassword(seedPhrase, pwd);
      setPwd(''); setConfirm('');
      await onSuccess();
    } catch (e2) {
      setErr(e2.message || 'Failed to encrypt');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-dark-200">
        Choose a password. Minimum 12 characters with at least 3 of:
        lowercase, uppercase, digit, symbol. You'll need to enter this
        password each time you open the wallet in a new tab.
      </p>

      <div className="space-y-2">
        <label className="block">
          <span className="block text-xs text-dark-400 mb-1">Password</span>
          <input
            type={show ? 'text' : 'password'}
            value={pwd}
            onChange={e => setPwd(e.target.value)}
            autoComplete="new-password"
            className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-md text-white"
          />
        </label>
        <label className="block">
          <span className="block text-xs text-dark-400 mb-1">Confirm password</span>
          <input
            type={show ? 'text' : 'password'}
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            autoComplete="new-password"
            className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-md text-white"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-dark-400">
          <input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} />
          Show password
        </label>
      </div>

      <div className="text-xs space-y-1">
        {pwd && !check.ok && (
          <p className="text-yellow-400">⚠ {check.reason}</p>
        )}
        {pwd && check.ok && (
          <p className="text-green-400">✓ Password meets the policy</p>
        )}
        {confirm && !matches && (
          <p className="text-yellow-400">⚠ Passwords don't match</p>
        )}
      </div>

      {err && <p className="text-xs text-red-400 break-words">{err}</p>}

      <SeedRecoveryNote />

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="flex-1 py-3 rounded-xl bg-dark-700 hover:bg-dark-600 text-white font-medium disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex-1 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-blue-500 text-white font-semibold disabled:opacity-40"
        >
          {busy ? 'Encrypting…' : 'Encrypt wallet'}
        </button>
      </div>
    </form>
  );
}
