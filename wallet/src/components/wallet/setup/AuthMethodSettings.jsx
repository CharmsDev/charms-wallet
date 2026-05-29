'use client';

/**
 * AuthMethodSettings — minimal info panel inside the Settings dialog.
 *
 * G003 decisions:
 *   - No switching between Type 1 and Type 2 (would change the
 *     wallet's mnemonic for Type 1, or be redundant for Type 2)
 *   - No "Disable encryption" — encryption is mandatory
 *
 * So this panel only shows: the active type + how to view the
 * recovery mnemonic (deferred — handled in the dedicated
 * /wallet-information page that already exists).
 */

import { useAuth } from '@/contexts/AuthContext';

export default function AuthMethodSettings() {
  const { walletType } = useAuth();

  if (!walletType) {
    return (
      <div className="glass-effect p-4 rounded-lg">
        <h3 className="text-lg font-medium text-white mb-2">Encryption</h3>
        <p className="text-sm text-yellow-300">
          Wallet not encrypted yet. Reload to start the secure-setup flow.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-effect p-4 rounded-lg space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-white">Encryption</h3>
        <span className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400">
          {walletType === 'prf' ? 'Passkey' : 'Password'}
        </span>
      </div>
      <p className="text-sm text-gray-300">
        {walletType === 'prf'
          ? 'This wallet is derived from your passkey via WebAuthn PRF. Nothing secret is stored on this device — biometric unlock reconstructs the keys each session.'
          : 'Your seed phrase is encrypted on this device with a PBKDF2-derived key from your password. Your browser saves the password for biometric autofill.'}
      </p>
      <p className="text-xs text-gray-400">
        To view your recovery phrase, open <strong>Wallet Information</strong> from the account menu. Recovery phrase is the universal backup — it works in any BIP39-compatible wallet.
      </p>
    </div>
  );
}
