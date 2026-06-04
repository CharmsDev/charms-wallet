'use client';

/**
 * PrfCreateStep — passkey path = one click, one biometric, done.
 *
 * Fires `createPrfWallet()` immediately on mount. The OS shows its
 * native biometric prompt (Touch ID / Face ID / Windows Hello /
 * Android biometric). On success → onDone(mnemonic) → backup step.
 *
 * Cross-device note: this always creates a new passkey + new wallet
 * on this device. iCloud Keychain / Google Password Manager will sync
 * the credential to the user's other devices, but recovering the SAME
 * wallet across devices via passkey-discovery would require the
 * cross-device picker (with QR option), which is bad UX for the
 * primary-device case. Cross-device wallet portability is therefore
 * exposed via the Import-seed-phrase path instead — standard BIP39
 * mnemonic backup. Cleaner and matches industry convention.
 */

import { useEffect, useRef, useState } from 'react';
import SetupShell from './SetupShell';
import { createPrfWallet } from '@/services/auth';

export default function PrfCreateStep({ onDone, onBack }) {
  const [err, setErr] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const firedRef = useRef(false);

  const run = async () => {
    setErr(null);
    try {
      const mnemonic = await createPrfWallet({ displayName: 'Charms Wallet user' });
      onDone(mnemonic);
    } catch (e) {
      setErr(e.message || 'Could not create passkey');
      setRetrying(false);
    }
  };

  // Fire once on mount so the OS biometric prompt appears immediately
  // — no extra click between "I want passkey" on Welcome and the
  // biometric.
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!err) {
    return (
      <SetupShell title="Setting up your wallet">
        <p className="text-sm text-dark-300 text-center">
          Confirm with your device's biometric (Touch ID / Face ID /
          Windows Hello / fingerprint).
        </p>
      </SetupShell>
    );
  }

  return (
    <SetupShell title="Passkey setup didn't complete">
      <p className="text-sm text-dark-200">
        The biometric prompt was cancelled or your device rejected the
        request. Tap below to try again, or go back and import an
        existing seed phrase instead.
      </p>
      <p className="text-xs text-red-400 break-words">{err}</p>
      <button
        onClick={() => { setRetrying(true); run(); }}
        disabled={retrying}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-primary-500 to-blue-500 text-white font-semibold disabled:opacity-50"
      >
        {retrying ? 'Waiting for biometric…' : 'Try again'}
      </button>
      <button
        onClick={onBack}
        disabled={retrying}
        className="text-xs text-dark-400 hover:text-dark-200 underline w-full text-center disabled:opacity-50"
      >
        ← Back
      </button>
    </SetupShell>
  );
}
