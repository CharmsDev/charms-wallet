'use client';

/**
 * DeleteWalletDialog — two-scope destructive confirmation.
 *
 * Scope A — "Delete from this device only":
 *   - Wipes the local v3 blob + addresses + UTXOs + charm caches
 *   - LEAVES the passkey in iCloud Keychain / Google Password
 *     Manager intact → the user can still restore the wallet on
 *     another synced device (or here later) via the Welcome step's
 *     "I already have a Charms wallet on another device" path.
 *
 * Scope B — "Delete from this device AND remove the passkey":
 *   - Same local wipe
 *   - Additionally calls `signalRemovePrfPasskey()` which uses the
 *     WebAuthn L3 `signalUnknownCredentialAsync` API to tell the OS
 *     the credential is no longer valid. iCloud Keychain / Google
 *     Password Manager may then propagate removal across devices.
 *   - Best-effort: some OS/browser combos require user confirmation
 *     in system Settings to fully delete. We tell the user this.
 *   - **Catastrophic**: once the passkey is gone everywhere, the
 *     wallet is unrecoverable unless the user has the seed phrase.
 *
 * For Type 2 (password) wallets, only Scope A applies — there's no
 * passkey to remove from the cloud.
 */

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { clearAllWalletData } from '@/services/storage';
import { signalRemovePrfPasskey } from '@/services/auth';
import PortalModal from './PortalModal';

export default function DeleteWalletDialog({ isOpen, onClose }) {
  const { walletType } = useAuth();
  const [busy, setBusy] = useState(null);    // null | 'local' | 'cloud'
  const [info, setInfo] = useState(null);

  const isPrf = walletType === 'prf';

  const onDeleteLocal = async () => {
    setBusy('local');
    try {
      await clearAllWalletData();
      onClose();
      window.location.reload();
    } catch (err) {
      console.error('Failed to delete wallet (local):', err);
      setBusy(null);
    }
  };

  const onDeleteEverywhere = async () => {
    if (!window.confirm(
      'Deleting from iCloud / Google removes the passkey from ALL your devices. ' +
      'Without your seed phrase backup, the wallet becomes unrecoverable. Continue?'
    )) return;
    setBusy('cloud');
    try {
      const signalled = await signalRemovePrfPasskey();
      await clearAllWalletData();
      if (!signalled) {
        // Browser didn't honor the signal — direct user to manual cleanup
        setInfo(
          'Local data wiped. The passkey may still appear in your system. To fully remove it, ' +
          'go to Settings → Passwords (Mac/iPhone) or chrome://settings/passkeys (Chrome) ' +
          'and delete entries for wallet.charms.dev.'
        );
        setBusy(null);
        return;
      }
      onClose();
      window.location.reload();
    } catch (err) {
      console.error('Failed to delete wallet (cloud):', err);
      setBusy(null);
    }
  };

  if (info) {
    return (
      <PortalModal isOpen={isOpen} onClose={() => { setInfo(null); window.location.reload(); }} title="Almost done" accent="neutral">
        <p className="text-sm text-yellow-300 mb-4">{info}</p>
        <button
          onClick={() => { setInfo(null); window.location.reload(); }}
          className="w-full bg-dark-700 hover:bg-dark-600 text-white py-2 px-4 rounded transition-colors"
        >
          Got it
        </button>
      </PortalModal>
    );
  }

  return (
    <PortalModal isOpen={isOpen} onClose={onClose} title="Delete wallet" accent="danger" closable={!busy}>
      <p className="text-sm text-gray-300 mb-4">
        Pick how far you want the deletion to reach. Both options wipe
        all wallet data from this device.
      </p>

      <div className="space-y-3">
        <button
          onClick={onDeleteLocal}
          disabled={!!busy}
          className="w-full text-left p-3 rounded-lg bg-dark-700 hover:bg-dark-600 text-white disabled:opacity-50"
        >
          <div className="font-semibold text-sm">Delete from this device only</div>
          <p className="text-xs text-dark-300 mt-1 leading-relaxed">
            {isPrf
              ? 'The passkey stays in iCloud Keychain / Google Password Manager. You can come back later (or on another synced device) and restore the same wallet.'
              : 'Local encrypted blob + addresses + caches gone. Your seed phrase backup is still the way to recover.'}
          </p>
          {busy === 'local' && <p className="text-xs text-dark-200 mt-2">Deleting…</p>}
        </button>

        {isPrf && (
          <button
            onClick={onDeleteEverywhere}
            disabled={!!busy}
            className="w-full text-left p-3 rounded-lg bg-red-900/40 border border-red-500/40 hover:bg-red-900/60 text-white disabled:opacity-50"
          >
            <div className="font-semibold text-sm text-red-300">Delete from this device AND remove the passkey from iCloud / Google</div>
            <p className="text-xs text-red-200/80 mt-1 leading-relaxed">
              ⚠️ Removes the synced passkey from all your devices. Without
              your seed phrase written down somewhere, the wallet is{' '}
              <strong>permanently unrecoverable</strong>. There is no undo.
            </p>
            {busy === 'cloud' && <p className="text-xs text-dark-200 mt-2">Signalling system…</p>}
          </button>
        )}
      </div>

      <button
        onClick={onClose}
        disabled={!!busy}
        className="w-full mt-4 bg-dark-700 hover:bg-dark-600 text-white py-2 px-4 rounded transition-colors disabled:opacity-50"
      >
        Cancel
      </button>

      <p className="text-[11px] text-dark-500 mt-4 leading-relaxed">
        Need to clean up multiple Charms passkeys? Open <strong>Settings → Passwords</strong> on
        Mac / iPhone (or <strong>chrome://settings/passkeys</strong> on Chrome) and remove entries for
        wallet.charms.dev manually.
      </p>
    </PortalModal>
  );
}
