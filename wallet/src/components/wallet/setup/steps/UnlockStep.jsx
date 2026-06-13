'use client';

/**
 * UnlockStep — caso A: already enrolled on this device.
 *
 * The v3 blob is in localStorage → we have a stored credentialId →
 * `unlockPrfWallet()` runs `get()` with `allowCredentials: [credId]`
 * which goes straight to the platform authenticator (Touch ID /
 * Face ID). The OS picker / hybrid QR dialog never appears.
 *
 * Single CTA, minimal copy. If the passkey turns out to be missing
 * from the local keychain (user wiped it from Settings), we surface
 * a clear error and offer the "restore from another device" path.
 */

import { useState } from 'react';
import SetupShell from './SetupShell';
import { unlockPrfWallet } from '@/services/auth';

export default function UnlockStep({ onDone, onRestore, onImport }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const unlock = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const mnemonic = await unlockPrfWallet();
      onDone(mnemonic);
    } catch (e) {
      setErr(e.message || 'Could not unlock.');
      setBusy(false);
    }
  };

  return (
    <SetupShell title="Open your Charms wallet">
      <p className="text-sm text-dark-300 text-center">
        Confirm with Face ID / Touch ID.
      </p>

      {err && <p className="text-xs text-red-400 break-words text-center">{err}</p>}

      <button
        onClick={unlock}
        disabled={busy}
        className="w-full btn btn-primary py-3"
      >
        {busy ? 'Waiting for biometric…' : 'Unlock'}
      </button>

      <div className="pt-2 space-y-2 text-center">
        <button
          onClick={onRestore}
          className="text-xs text-dark-400 hover:text-dark-200 underline"
        >
          Passkey no longer available? Restore from another device →
        </button>
        <button
          onClick={onImport}
          className="text-xs text-dark-400 hover:text-dark-200 underline block w-full"
        >
          Or import a seed phrase from another wallet →
        </button>
      </div>
    </SetupShell>
  );
}
