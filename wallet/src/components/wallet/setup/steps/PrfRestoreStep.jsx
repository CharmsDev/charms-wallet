'use client';

/**
 * PrfRestoreStep — second device path. Looks for a Charms passkey
 * already synced to this device via iCloud Keychain / Google Password
 * Manager and unlocks the existing wallet.
 *
 * Flow on mount:
 *   1. Call restorePrfWallet() → navigator.credentials.get() with
 *      allowCredentials:[] (discoverable lookup) + PRF eval.
 *   2. If the OS picker surfaces the synced passkey → user authenticates
 *      with Face ID / Touch ID → same PRF bytes as on the original
 *      device → same mnemonic → same wallet → done.
 *   3. If the user cancels or no synced passkey is available → show
 *      a clear "no passkey found" UI with Try-again / Back actions.
 *
 * The QR / "use another device" picker the browser may show is
 * unavoidable when no local credential is found — but it only appears
 * if iCloud / Google sync is missing on this device. Healthy sync =
 * picker shows the passkey directly, no QR.
 */

import { useEffect, useRef, useState } from 'react';
import SetupShell from './SetupShell';
import { restorePrfWallet } from '@/services/auth';

const PHASE = { SEARCHING: 'searching', NOT_FOUND: 'not-found', ERROR: 'error' };

export default function PrfRestoreStep({ onDone, onBack }) {
  const [phase, setPhase] = useState(PHASE.SEARCHING);
  const [err, setErr] = useState(null);
  const firedRef = useRef(false);

  const run = async () => {
    setErr(null);
    setPhase(PHASE.SEARCHING);
    try {
      const mnemonic = await restorePrfWallet();
      if (mnemonic) {
        onDone(mnemonic);
        return;
      }
      setPhase(PHASE.NOT_FOUND);
    } catch (e) {
      setErr(e.message || 'Restore failed');
      setPhase(PHASE.ERROR);
    }
  };

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === PHASE.SEARCHING) {
    return (
      <SetupShell title="Looking for your passkey…">
        <p className="text-sm text-dark-300 text-center">
          Pick your Charms passkey in the system prompt and confirm with
          Face ID / Touch ID.
        </p>
      </SetupShell>
    );
  }

  if (phase === PHASE.NOT_FOUND) {
    return (
      <SetupShell title="No Charms passkey found here">
        <p className="text-sm text-dark-200">
          We couldn't find a Charms passkey synced to this device. A few
          things to check:
        </p>
        <ul className="text-xs text-dark-400 space-y-1 list-disc pl-5">
          <li>You're signed in with the SAME Apple ID / Google account
              as the device where you originally created the wallet.</li>
          <li>iCloud Keychain (Mac / iPhone) or Google Password Manager
              (Android / Chrome) is enabled.</li>
          <li>Sync has had a few minutes to propagate after the original
              creation.</li>
        </ul>
        <div className="flex gap-3">
          <button onClick={onBack} className="flex-1 btn btn-secondary py-3">
            Back
          </button>
          <button onClick={run} className="flex-1 btn btn-primary py-3">
            Try again
          </button>
        </div>
      </SetupShell>
    );
  }

  return (
    <SetupShell title="Restore didn't complete">
      <p className="text-sm text-dark-200">Something went wrong while looking for your passkey.</p>
      <p className="text-xs text-red-400 break-words">{err}</p>
      <div className="flex gap-3">
        <button onClick={onBack} className="flex-1 btn btn-secondary py-3">Back</button>
        <button onClick={run} className="flex-1 btn btn-primary py-3">Try again</button>
      </div>
    </SetupShell>
  );
}
