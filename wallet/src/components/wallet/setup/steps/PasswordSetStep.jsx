'use client';

import { useState } from 'react';
import SetupShell from './SetupShell';
import { validatePassword } from '@/services/auth';

/**
 * Collect a new password from the user. Uses semantic HTML so the
 * browser offers to save the password in its native password manager
 * (Chrome, Safari, Firefox) — that's what enables biometric autofill
 * next time.
 *
 * Controlled by the wizard: `busy` and `error` are passed in, so a
 * failed `onSubmit` correctly re-enables the form and surfaces the
 * error here instead of on a later step.
 */
export default function PasswordSetStep({ onSubmit, onBack, busy = false, error = null, isMigration = false }) {
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);

  const check = validatePassword(pwd);
  const matches = pwd && pwd === confirm;
  const canSubmit = check.ok && matches && !busy;

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(pwd);
  };

  return (
    <SetupShell title={isMigration ? 'Secure your existing wallet' : 'Set a password'}>
      {isMigration && (
        <div className="rounded-lg border border-primary-500/30 bg-primary-500/10 p-3 space-y-2">
          <p className="text-sm text-primary-200">
            We're upgrading your wallet's security. Your addresses and
            balances stay exactly the same — we're just encrypting the
            seed phrase that currently sits in plaintext on this device.
          </p>
          <p className="text-xs text-dark-300 leading-relaxed">
            <strong>Why password and not a passkey?</strong> A passkey-
            derived wallet (where the passkey IS the wallet) would
            generate different addresses, so it's only available when
            you create a wallet from scratch. Here we encrypt your
            existing seed with a password. Your browser may offer to
            remember the password and unlock with Touch ID / Face ID —
            that's an autofill convenience, not the wallet's security
            floor.
          </p>
        </div>
      )}

      {!isMigration && (
        <p className="text-sm text-dark-200">
          Your password protects the encrypted seed phrase on this device.
          Your browser will offer to save it — accept so you can unlock
          with biometric next time.
        </p>
      )}

      {/* Semantic form so browser password managers detect + save the credential. */}
      <form onSubmit={submit} className="space-y-3" autoComplete="on">
        <input
          type="text"
          name="username"
          value="Charms Wallet"
          readOnly
          autoComplete="username"
          className="hidden"
        />

        <label className="block">
          <span className="block text-xs text-dark-400 mb-1">Password</span>
          <input
            type={show ? 'text' : 'password'}
            name="password"
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
            name="confirm-password"
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

        <div className="text-xs space-y-1">
          {pwd && !check.ok && <p className="text-yellow-400">⚠ {check.reason}</p>}
          {pwd && check.ok && <p className="text-green-400">✓ Password meets the policy</p>}
          {confirm && !matches && <p className="text-yellow-400">⚠ Passwords don't match</p>}
          {error && <p className="text-red-400 break-words">{error}</p>}
        </div>

        <div className="flex gap-3">
          {onBack && (
            <button type="button" onClick={onBack} disabled={busy} className="flex-1 btn btn-secondary py-3">
              Back
            </button>
          )}
          <button type="submit" disabled={!canSubmit} className="flex-1 btn btn-primary py-3 disabled:opacity-40">
            {busy ? 'Encrypting…' : 'Continue'}
          </button>
        </div>
      </form>
    </SetupShell>
  );
}
