'use client';

/**
 * Unlock screen — Type-aware. Reads `walletType` from AuthContext and
 * shows either the biometric button (Type 1) or the password input
 * (Type 2).
 *
 * Both branches end at the same outcome: AuthContext pushes the
 * mnemonic into walletStore + flips status to 'unlocked'.
 *
 * The "Forgot? Restore from seed phrase" link works for both methods:
 * wipes the AUTH blob and reloads — the user lands in the wizard
 * import path with a clean slate.
 */

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { removeBlob } from '@/services/auth';

export default function WalletUnlock() {
  const { walletType, triggerUnlockPrf, triggerUnlockPassword, error } = useAuth();
  const [busy, setBusy] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [password, setPassword] = useState('');

  // Single error source: AuthContext.error. Both trigger* functions
  // store the message there before rethrowing. We catch the rethrow
  // just to reset busy — no second error state needed.

  const onPasskey = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await triggerUnlockPrf();
    } catch (_) {
      // intentional: AuthContext stored the user-facing message
    } finally {
      setBusy(false);
    }
  };

  const onPasswordSubmit = async (e) => {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    try {
      await triggerUnlockPassword(password);
      setPassword('');
    } catch (_) {
      // intentional: AuthContext stored the user-facing message
    } finally {
      setBusy(false);
    }
  };

  const onRestoreConfirm = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      await removeBlob();
      window.location.reload();
    } catch (_) {
      setRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-dark-950/95 backdrop-blur-sm">
      <div className="text-center space-y-6 max-w-sm px-6 w-full">
        <UnlockIcon />
        <div>
          <h2 className="text-xl font-semibold gradient-text mb-2">Unlock Wallet</h2>
          <p className="text-sm text-dark-300">
            {walletType === 'password' ? 'Enter your password to unlock.' : 'Authenticate with your passkey to access your wallet.'}
          </p>
        </div>

        {!showRestore && walletType === 'prf' && (
          <PrfUnlock busy={busy} error={error} onClick={onPasskey} onRestore={() => setShowRestore(true)} />
        )}
        {!showRestore && walletType === 'password' && (
          <PasswordUnlock
            busy={busy}
            password={password}
            setPassword={setPassword}
            onSubmit={onPasswordSubmit}
            error={error}
            onRestore={() => setShowRestore(true)}
          />
        )}
        {showRestore && (
          <RestoreConfirm restoring={restoring} onConfirm={onRestoreConfirm} onCancel={() => setShowRestore(false)} />
        )}
      </div>
    </div>
  );
}

function UnlockIcon() {
  return (
    <div className="w-16 h-16 rounded-full bg-primary-500/20 flex items-center justify-center mx-auto">
      <svg className="w-8 h-8 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    </div>
  );
}

function PrfUnlock({ busy, error, onClick, onRestore }) {
  return (
    <>
      <button onClick={onClick} disabled={busy} className="w-full py-3 rounded-xl bg-gradient-to-r from-primary-500 to-blue-500 text-white font-semibold disabled:opacity-50">
        {busy ? 'Waiting for biometric…' : 'Unlock with passkey'}
      </button>
      {error && <p className="text-xs text-red-400 break-words">{error}</p>}
      <RestoreLink onClick={onRestore} />
      <p className="text-[10px] text-dark-500">
        Your wallet is derived from your passkey via WebAuthn PRF. Nothing secret is stored on this device.
      </p>
    </>
  );
}

function PasswordUnlock({ busy, password, setPassword, onSubmit, error, onRestore }) {
  return (
    <>
      <form onSubmit={onSubmit} className="space-y-3 text-left" autoComplete="on">
        <input
          type="text" name="username" value="Charms Wallet" readOnly
          autoComplete="username" className="hidden"
        />
        <input
          type="password"
          name="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          autoFocus
          className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-md text-white"
        />
        <button type="submit" disabled={busy || !password} className="w-full py-3 rounded-xl bg-gradient-to-r from-primary-500 to-blue-500 text-white font-semibold disabled:opacity-50">
          {busy ? 'Unlocking…' : 'Unlock'}
        </button>
      </form>
      {error && <p className="text-xs text-red-400 break-words">{error}</p>}
      <RestoreLink onClick={onRestore} />
      <p className="text-[10px] text-dark-500">
        Your seed phrase is encrypted with a key derived from your password.
      </p>
    </>
  );
}

function RestoreConfirm({ restoring, onConfirm, onCancel }) {
  return (
    <div className="space-y-4 text-left">
      <p className="text-sm text-dark-200">
        This will erase the encrypted wallet from this device. You'll need to re-enter your 12 or 24 word recovery phrase to continue.
      </p>
      <p className="text-xs text-yellow-400">
        ⚠️ Only proceed if you have your seed phrase backed up offline.
      </p>
      <div className="flex gap-3">
        <button onClick={onCancel} disabled={restoring} className="flex-1 py-3 rounded-xl bg-dark-700 hover:bg-dark-600 text-white font-medium disabled:opacity-50">
          Cancel
        </button>
        <button onClick={onConfirm} disabled={restoring} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-blue-500 text-white font-semibold disabled:opacity-50">
          {restoring ? 'Resetting…' : 'I have my seed phrase'}
        </button>
      </div>
    </div>
  );
}

function RestoreLink({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="text-xs text-dark-400 hover:text-dark-200 underline">
      Forgot? Restore from seed phrase
    </button>
  );
}
