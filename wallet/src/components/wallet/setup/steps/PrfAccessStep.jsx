'use client';

/**
 * PrfAccessStep — single-button passkey entry. One wallet per user,
 * across all their synced devices. The user never has to decide
 * "create vs restore" — the system figures it out:
 *
 *   1. On mount, run restorePrfWallet() → discoverable get() across
 *      iCloud Keychain / Google Password Manager / etc.
 *   2. If a Charms passkey is found → use it → same mnemonic on
 *      every synced device.
 *   3. If user cancels OR no passkey exists in this ecosystem →
 *      explicit prompt: "No Charms wallet found here. Try again or
 *      create one?"
 *      - Try again: re-run get() in case the cancel was accidental
 *      - Create: create() → biometric → new passkey → wallet
 *
 * The explicit prompt is the anti-trap: a user who has a synced
 * passkey but cancels the system picker by mistake would otherwise
 * silently get a brand-new wallet and lose access to their existing
 * one. Forcing them to confirm "yes, create new" prevents that.
 *
 * Cross-ecosystem note (e.g. user on Apple AND on Google): each
 * ecosystem syncs its own passkeys; the user will see "no wallet
 * found" in the second ecosystem and we'll let them either Import
 * the seed phrase or create a fresh wallet there.
 */

import { useEffect, useRef, useState } from 'react';
import SetupShell from './SetupShell';
import { restorePrfWallet, createPrfWallet } from '@/services/auth';

const PHASE = { SEARCHING: 'searching', PROMPT_CREATE: 'prompt-create', CREATING: 'creating', ERROR: 'error' };

export default function PrfAccessStep({ onDone, onBack }) {
  const [phase, setPhase] = useState(PHASE.SEARCHING);
  const [err, setErr] = useState(null);
  const firedRef = useRef(false);

  const search = async () => {
    setErr(null);
    setPhase(PHASE.SEARCHING);
    try {
      const mnemonic = await restorePrfWallet();
      if (mnemonic) return onDone(mnemonic);
      setPhase(PHASE.PROMPT_CREATE);
    } catch (e) {
      setErr(e.message || 'Lookup failed');
      setPhase(PHASE.ERROR);
    }
  };

  const create = async () => {
    setErr(null);
    setPhase(PHASE.CREATING);
    try {
      const mnemonic = await createPrfWallet({ displayName: 'Charms Wallet user' });
      onDone(mnemonic);
    } catch (e) {
      setErr(e.message || 'Could not create passkey');
      setPhase(PHASE.PROMPT_CREATE);
    }
  };

  // Fire discovery once on mount so the OS picker / biometric prompt
  // appears immediately, before the user has to click anything extra.
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === PHASE.SEARCHING) {
    return (
      <SetupShell title="Opening your Charms wallet…">
        <p className="text-sm text-dark-300 text-center">
          If you have a passkey for Charms in iCloud Keychain / Google
          Password Manager, pick it in the system prompt and confirm
          with Face ID / Touch ID.
        </p>
      </SetupShell>
    );
  }

  if (phase === PHASE.CREATING) {
    return (
      <SetupShell title="Creating your wallet…">
        <p className="text-sm text-dark-300 text-center">
          Confirm with Face ID / Touch ID.
        </p>
      </SetupShell>
    );
  }

  if (phase === PHASE.PROMPT_CREATE) {
    return (
      <SetupShell title="No Charms wallet found here">
        <p className="text-sm text-dark-200">
          We couldn't find a Charms passkey synced to this device.
        </p>
        <ul className="text-xs text-dark-400 space-y-1 list-disc pl-5">
          <li>If you already have a wallet on another device, make sure iCloud Keychain
              (Apple) or Google Password Manager (Android / Chrome) sync is on and
              signed in with the same account, then tap <strong>Try again</strong>.</li>
          <li>If this is your first time setting up Charms, tap <strong>Create wallet</strong> —
              we'll register a new passkey on this device and your other synced devices
              will see it automatically.</li>
        </ul>
        {err && <p className="text-xs text-red-400 break-words">{err}</p>}
        <div className="flex gap-3">
          <button onClick={search} className="flex-1 btn btn-secondary py-3">
            Try again
          </button>
          <button onClick={create} className="flex-1 btn btn-primary py-3">
            Create wallet
          </button>
        </div>
        <button onClick={onBack} className="text-xs text-dark-400 hover:text-dark-200 underline w-full text-center">
          ← Back
        </button>
      </SetupShell>
    );
  }

  return (
    <SetupShell title="Something went wrong">
      <p className="text-sm text-dark-200">An error occurred while accessing your wallet.</p>
      <p className="text-xs text-red-400 break-words">{err}</p>
      <div className="flex gap-3">
        <button onClick={onBack} className="flex-1 btn btn-secondary py-3">Back</button>
        <button onClick={search} className="flex-1 btn btn-primary py-3">Try again</button>
      </div>
    </SetupShell>
  );
}
