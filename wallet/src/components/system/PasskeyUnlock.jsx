'use client';

/**
 * Fullscreen unlock screen shown when the wallet is locked. Method
 * dispatch:
 *   method === 'prf'      → "Unlock with passkey" button (biometric)
 *   method === 'password' → password input
 *
 * The "Forgot? Restore from seed phrase" link is shown for both
 * methods: it wipes the AUTH blob and reloads, so the user can
 * re-import from their written seed.
 */

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { disable as disableAuth } from '@/services/auth';

export default function PasskeyUnlock() {
  const { method, triggerUnlockPasskey, triggerUnlockPassword, error } = useAuth();
  const [busy, setBusy] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [password, setPassword] = useState('');
  const [localErr, setLocalErr] = useState(null);

  const onPasskey = async () => {
    if (busy) return;
    setBusy(true); setLocalErr(null);
    try { await triggerUnlockPasskey(); }
    catch (_) { /* AuthContext stored the error */ }
    finally { setBusy(false); }
  };

  const onPasswordSubmit = async (e) => {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true); setLocalErr(null);
    try {
      await triggerUnlockPassword(password);
      setPassword('');
    } catch (e2) {
      setLocalErr(e2.message || 'Unlock failed');
    } finally {
      setBusy(false);
    }
  };

  const onRestoreConfirm = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      await disableAuth();
      window.location.reload();
    } catch (_) {
      setRestoring(false);
    }
  };

  const title = method === 'password' ? 'Unlock Wallet' : 'Unlock Wallet';
  const blurb = method === 'password'
    ? 'Enter your password to unlock.'
    : 'Authenticate with your passkey to access your wallet.';

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-dark-950/95 backdrop-blur-sm">
      <div className="text-center space-y-6 max-w-sm px-6 w-full">
        <div className="w-16 h-16 rounded-full bg-primary-500/20 flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        <div>
          <h2 className="text-xl font-semibold gradient-text mb-2">{title}</h2>
          <p className="text-sm text-dark-300">{blurb}</p>
        </div>

        {!showRestore && method === 'prf' && (
          <>
            <button
              onClick={onPasskey}
              disabled={busy}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-primary-500 to-blue-500 text-white font-semibold disabled:opacity-50"
            >
              {busy ? 'Waiting for biometric…' : 'Unlock with passkey'}
            </button>
            {error && <p className="text-xs text-red-400 break-words">{error}</p>}
            <RestoreLink onClick={() => setShowRestore(true)} />
            <p className="text-[10px] text-dark-500">
              Your seed phrase is encrypted locally with a key derived from
              your passkey (WebAuthn PRF). It never leaves this device.
            </p>
          </>
        )}

        {!showRestore && method === 'password' && (
          <>
            <form onSubmit={onPasswordSubmit} className="space-y-3 text-left">
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                autoFocus
                className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-md text-white"
              />
              <button
                type="submit"
                disabled={busy || !password}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-primary-500 to-blue-500 text-white font-semibold disabled:opacity-50"
              >
                {busy ? 'Unlocking…' : 'Unlock'}
              </button>
            </form>
            {(localErr || error) && (
              <p className="text-xs text-red-400 break-words">{localErr || error}</p>
            )}
            <RestoreLink onClick={() => setShowRestore(true)} />
            <p className="text-[10px] text-dark-500">
              Your seed phrase is encrypted locally with a key derived from
              your password. It never leaves this device.
            </p>
          </>
        )}

        {showRestore && (
          <div className="space-y-4 text-left">
            <p className="text-sm text-dark-200">
              This will erase the encrypted seed from this device. You'll
              need to re-enter your 12 or 24 word recovery phrase to
              continue.
            </p>
            <p className="text-xs text-yellow-400">
              ⚠️ Only proceed if you have your seed phrase backed up
              offline. Without it, this device cannot recover the wallet.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowRestore(false)}
                disabled={restoring}
                className="flex-1 py-3 rounded-xl bg-dark-700 hover:bg-dark-600 text-white font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={onRestoreConfirm}
                disabled={restoring}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-blue-500 text-white font-semibold disabled:opacity-50"
              >
                {restoring ? 'Resetting…' : 'I have my seed phrase'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RestoreLink({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs text-dark-400 hover:text-dark-200 underline"
    >
      Forgot? Restore from seed phrase
    </button>
  );
}
