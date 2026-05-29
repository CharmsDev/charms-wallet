'use client';

import { useState } from 'react';
import SetupShell from './SetupShell';
import { createPrfWallet } from '@/services/auth';

/**
 * Runs the WebAuthn create ceremony. On success returns the
 * just-derived mnemonic to the wizard via onDone(mnemonic). The
 * wizard then moves to the optional backup step.
 *
 * Local busy/err state is fine here because the only success path
 * unmounts this step (advance to backup). On error we resume editable.
 */
export default function PasskeyEnrollStep({ onDone, onBack }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const mnemonic = await createPrfWallet({ displayName: 'Charms Wallet user' });
      onDone(mnemonic);
    } catch (e) {
      setErr(e.message || 'Passkey setup failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SetupShell title="Set up your passkey">
      <p className="text-sm text-dark-200">
        Authenticate with your device (Touch ID, Face ID, Windows Hello,
        or your security key). The passkey becomes your wallet —
        deterministic, hardware-backed, syncs across your devices.
      </p>
      <ul className="text-xs text-dark-400 space-y-1 list-disc pl-5">
        <li>Nothing secret is written to disk on this device.</li>
        <li>Open the wallet on a synced device → biometric → same wallet.</li>
        <li>Lose all devices? Optional written backup recovers it.</li>
      </ul>
      <button onClick={run} disabled={busy} className="btn btn-primary w-full py-3">
        {busy ? 'Waiting for biometric…' : 'Set up passkey'}
      </button>
      {err && <p className="text-xs text-red-400 break-words">{err}</p>}
      <button onClick={onBack} disabled={busy} className="text-xs text-dark-400 hover:text-dark-200 underline w-full text-center">
        ← Back
      </button>
    </SetupShell>
  );
}
