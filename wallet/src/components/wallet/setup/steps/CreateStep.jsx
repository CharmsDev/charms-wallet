'use client';

/**
 * CreateStep — caso B: no blob on this device.
 *
 * Primary CTA creates a fresh passkey wallet directly. The OS picker
 * with QR (cross-device discovery) is NOT invoked here — that flow
 * is opt-in via the "Restore from another device" link below, which
 * routes to PrfAccessStep (the discovery + create-fallback path).
 *
 * Single visible decision: create. The link to restore is small and
 * present for users who know they have a synced passkey on another
 * device (iCloud Keychain / Google Password Manager). They can also
 * import an existing seed phrase.
 *
 * `extraAction` ({ label, onClick }) lets a host surface one additional
 * primary path without forking the wizard. The extension popup uses it
 * for "Transfer from Charms Web Wallet" — which is its main route,
 * since passkeys cannot be enrolled on a chrome-extension:// origin.
 */

import { useState } from 'react';
import SetupShell from './SetupShell';
import { createPrfWallet } from '@/services/auth';

export default function CreateStep({ prfSupported, onDone, onRestore, onImport, extraAction = null }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const mnemonic = await createPrfWallet({ displayName: 'Charms Wallet user' });
      onDone(mnemonic);
    } catch (e) {
      setErr(e.message || 'Could not create passkey.');
      setBusy(false);
    }
  };

  return (
    <SetupShell title="Welcome to Charms">
      <p className="text-sm text-dark-300 text-center">
        Your wallet is created with one tap and secured by your
        device's passkey — no seed phrase to write down, no password
        to remember.
      </p>

      {err && <p className="text-xs text-red-400 break-words text-center">{err}</p>}

      <button
        onClick={create}
        disabled={!prfSupported || busy}
        className="w-full btn btn-primary py-3"
      >
        {busy ? 'Waiting for biometric…' : 'Create with passkey'}
      </button>

      {!prfSupported && (
        <p className="text-xs text-yellow-400 text-center">
          {extraAction
            ? 'Passkeys cannot be created here. Bring your existing wallet over with the option below, or import a seed phrase.'
            : "Passkeys aren't supported on this browser. Use the import option below or open Charms in Chrome, Safari or Edge."}
        </p>
      )}

      {extraAction && (
        <>
          <div className="relative flex items-center pt-1">
            <div className="flex-grow border-t border-dark-600" />
            <span className="flex-shrink mx-4 text-gray-400 text-xs">or</span>
            <div className="flex-grow border-t border-dark-600" />
          </div>
          <button
            onClick={extraAction.onClick}
            className="w-full py-3 px-4 rounded-lg border border-bitcoin-500/40 bg-bitcoin-500/10 hover:bg-bitcoin-500/20 text-bitcoin-400 font-medium transition-colors text-sm"
          >
            {extraAction.label}
          </button>
        </>
      )}

      <div className="pt-2 border-t border-white/10 space-y-2 text-center">
        <button
          onClick={onRestore}
          disabled={!prfSupported}
          className="text-xs text-dark-400 hover:text-dark-200 underline block w-full disabled:opacity-40"
        >
          Already have a Charms wallet on another device? Restore via iCloud / Google →
        </button>
        <button
          onClick={onImport}
          className="text-xs text-dark-400 hover:text-dark-200 underline block w-full"
        >
          Or import a 12 / 24-word seed phrase →
        </button>
      </div>
    </SetupShell>
  );
}
