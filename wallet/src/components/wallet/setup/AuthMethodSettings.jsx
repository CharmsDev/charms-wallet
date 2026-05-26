'use client';

/**
 * AuthMethodSettings — manage the wallet's local encryption method.
 * Post-migration the wallet is always encrypted (passkey or password),
 * so this panel only offers switching between methods or changing the
 * password. There is no "disable encryption" — that's intentional;
 * users who want to wipe must go through Delete Wallet.
 *
 * Lives inside SettingsDialog (header → Account menu → Settings).
 */

import { useState } from 'react';
import { useWallet } from '@/stores/walletStore';
import { useAuth } from '@/contexts/AuthContext';
import {
  enroll, enrollPassword, validatePassword, disable as authDisable,
} from '@/services/auth';

export default function AuthMethodSettings() {
  const { seedPhrase } = useWallet();
  const { method, prfSupported, refreshAuthState } = useAuth();

  const [view, setView] = useState('summary'); // 'summary' | 'switch-password' | 'switch-passkey' | 'change-password'
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!method) {
    // Should never render — MigrationGate enforces enrollment. But
    // defensively show a hint instead of breaking the dialog.
    return (
      <div className="glass-effect p-4 rounded-lg">
        <h3 className="text-lg font-medium text-white mb-2">Encryption</h3>
        <p className="text-sm text-yellow-300">
          This wallet isn't encrypted yet. Reload to start the secure-setup flow.
        </p>
      </div>
    );
  }

  const onSwitchToPassword = async (newPwd) => {
    setBusy(true); setErr(null);
    try {
      await authDisable();             // wipe old blob
      await enrollPassword(seedPhrase, newPwd);
      await refreshAuthState();
      setView('summary');
    } catch (e) {
      setErr(e.message || 'Switch failed');
    } finally {
      setBusy(false);
    }
  };

  const onSwitchToPasskey = async () => {
    setBusy(true); setErr(null);
    try {
      await authDisable();
      await enroll(seedPhrase, { displayName: 'Charms Wallet user' });
      await refreshAuthState();
      setView('summary');
    } catch (e) {
      setErr(e.message || 'Switch failed');
    } finally {
      setBusy(false);
    }
  };

  const onChangePassword = async (newPwd) => {
    setBusy(true); setErr(null);
    try {
      await authDisable();
      await enrollPassword(seedPhrase, newPwd);
      await refreshAuthState();
      setView('summary');
    } catch (e) {
      setErr(e.message || 'Change failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-effect p-4 rounded-lg space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-white">Encryption</h3>
        <span className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400">
          {method === 'prf' ? 'Passkey' : 'Password'}
        </span>
      </div>

      {view === 'summary' && (
        <>
          <p className="text-sm text-gray-300">
            Your seed phrase is encrypted on this device with{' '}
            {method === 'prf' ? 'a passkey (WebAuthn PRF).' : 'your password (PBKDF2-derived key).'}
          </p>

          <div className="flex flex-col gap-2">
            {method === 'prf' && (
              <button
                onClick={() => setView('switch-password')}
                disabled={busy}
                className="text-sm px-3 py-2 rounded bg-dark-700 hover:bg-dark-600 text-white text-left"
              >
                Switch to password
              </button>
            )}
            {method === 'password' && prfSupported && (
              <button
                onClick={onSwitchToPasskey}
                disabled={busy}
                className="text-sm px-3 py-2 rounded bg-dark-700 hover:bg-dark-600 text-white text-left disabled:opacity-50"
              >
                {busy ? 'Switching…' : 'Switch to passkey'}
              </button>
            )}
            {method === 'password' && (
              <button
                onClick={() => setView('change-password')}
                disabled={busy}
                className="text-sm px-3 py-2 rounded bg-dark-700 hover:bg-dark-600 text-white text-left"
              >
                Change password
              </button>
            )}
          </div>

          {err && <p className="text-xs text-red-400 break-words">{err}</p>}
        </>
      )}

      {(view === 'switch-password' || view === 'change-password') && (
        <PasswordForm
          submitLabel={view === 'change-password' ? 'Update password' : 'Switch to password'}
          busy={busy}
          onSubmit={view === 'change-password' ? onChangePassword : onSwitchToPassword}
          onCancel={() => setView('summary')}
        />
      )}
    </div>
  );
}

function PasswordForm({ submitLabel, busy, onSubmit, onCancel }) {
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const check = validatePassword(pwd);
  const matches = pwd && pwd === confirm;
  const canSubmit = check.ok && matches && !busy;

  return (
    <form
      onSubmit={e => { e.preventDefault(); if (canSubmit) onSubmit(pwd); }}
      className="space-y-3"
    >
      <input
        type="password"
        value={pwd}
        onChange={e => setPwd(e.target.value)}
        placeholder="New password"
        autoComplete="new-password"
        className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-md text-white"
      />
      <input
        type="password"
        value={confirm}
        onChange={e => setConfirm(e.target.value)}
        placeholder="Confirm password"
        autoComplete="new-password"
        className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-md text-white"
      />
      <div className="text-xs space-y-1">
        {pwd && !check.ok && <p className="text-yellow-400">⚠ {check.reason}</p>}
        {pwd && check.ok && <p className="text-green-400">✓ Password meets the policy</p>}
        {confirm && !matches && <p className="text-yellow-400">⚠ Passwords don't match</p>}
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="flex-1 py-2 rounded bg-dark-700 hover:bg-dark-600 text-white disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex-1 py-2 rounded bg-gradient-to-r from-primary-500 to-blue-500 text-white font-medium disabled:opacity-40"
        >
          {busy ? 'Working…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
