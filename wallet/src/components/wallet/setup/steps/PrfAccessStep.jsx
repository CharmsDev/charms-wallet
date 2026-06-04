'use client';

/**
 * PrfAccessStep — single entry point for the passkey path on a new
 * device. Tries to discover an existing synced passkey first; if the
 * user cancels or has none, offers an explicit choice between
 * retrying and creating a fresh wallet.
 *
 * This prevents the silent-create trap: a user with a synced passkey
 * who accidentally cancels the picker would otherwise get a brand
 * new (empty) wallet without realising their funds are on the
 * original passkey's wallet.
 */

import { useEffect, useState } from 'react';
import SetupShell from './SetupShell';
import { restorePrfWallet, createPrfWallet } from '@/services/auth';

const PHASE = { TRYING: 'trying', CHOOSE: 'choose', BUSY: 'busy', ERROR: 'error' };

export default function PrfAccessStep({ onDone, onBack }) {
  const [phase, setPhase] = useState(PHASE.TRYING);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mnemonic = await restorePrfWallet();
        if (cancelled) return;
        if (mnemonic) return onDone(mnemonic);   // existing wallet found
        setPhase(PHASE.CHOOSE);                  // user cancelled / no creds
      } catch (e) {
        if (cancelled) return;
        setErr(e.message || 'Passkey lookup failed');
        setPhase(PHASE.ERROR);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tryAgain = async () => {
    setErr(null);
    setPhase(PHASE.TRYING);
    try {
      const mnemonic = await restorePrfWallet();
      if (mnemonic) return onDone(mnemonic);
      setPhase(PHASE.CHOOSE);
    } catch (e) {
      setErr(e.message); setPhase(PHASE.ERROR);
    }
  };

  const createFresh = async () => {
    setErr(null);
    setPhase(PHASE.BUSY);
    try {
      const mnemonic = await createPrfWallet({ displayName: 'Charms Wallet user' });
      onDone(mnemonic);
    } catch (e) {
      setErr(e.message || 'Could not create passkey'); setPhase(PHASE.ERROR);
    }
  };

  if (phase === PHASE.TRYING) {
    return (
      <SetupShell title="Looking for your passkey…">
        <p className="text-sm text-dark-300 text-center">
          Your browser will ask you to pick a passkey. If you've used Charms
          Wallet before on a synced device, choose it now.
        </p>
      </SetupShell>
    );
  }

  if (phase === PHASE.BUSY) {
    return (
      <SetupShell title="Setting up your wallet…">
        <p className="text-sm text-dark-300 text-center">Creating a new passkey on this device.</p>
      </SetupShell>
    );
  }

  return (
    <SetupShell title="No passkey selected">
      <p className="text-sm text-dark-200">
        No passkey was used. If you have one synced on another device, try
        again — otherwise create a fresh wallet now.
      </p>
      <ul className="text-xs text-dark-400 space-y-1 list-disc pl-5">
        <li>If you've used Charms before and have iCloud Keychain or Google
            Password Manager enabled, Try again should surface your passkey.</li>
        <li>If this is your first time, Create new wallet will set up a brand
            new passkey on this device. Your wallet will be empty until you
            receive funds.</li>
      </ul>
      {err && <p className="text-xs text-red-400 break-words">{err}</p>}
      <div className="flex gap-3">
        <button onClick={tryAgain} className="flex-1 btn btn-secondary py-3">Try again</button>
        <button onClick={createFresh} className="flex-1 btn btn-primary py-3">Create new wallet</button>
      </div>
      <button onClick={onBack} className="text-xs text-dark-400 hover:text-dark-200 underline w-full text-center">
        ← Back
      </button>
    </SetupShell>
  );
}
