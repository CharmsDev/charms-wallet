'use client';

import SetupShell from './SetupShell';

/**
 * Welcome — single entry point. Two cards represent the two
 * fundamentally different wallet types:
 *
 *   1. Passkey-derived (Type 1): the passkey IS the wallet. Same
 *      passkey + same salt = same wallet, forever. If the user has a
 *      synced passkey from another device, this surfaces it; if not,
 *      a fresh one is created.
 *
 *   2. Import seed phrase (Type 2): paste an existing BIP39 mnemonic
 *      and protect it with a password. Used for cross-wallet
 *      portability or browsers without PRF support.
 *
 * `extraAction` is consumed by the extension popup for its
 * "Transfer from Web Wallet" path.
 */
export default function WelcomeStep({ onPasskey, onImport, prfSupported, extraAction }) {
  return (
    <SetupShell title="Charms Wallet">
      <p className="text-sm text-dark-300 text-center">
        Choose how to access your wallet.
      </p>

      <button
        onClick={onPasskey}
        disabled={!prfSupported}
        className="w-full text-left p-4 rounded-xl bg-gradient-to-r from-primary-500 to-blue-500 hover:opacity-90 text-white disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold">My Charms wallet (passkey)</span>
          {prfSupported && <span className="text-[10px] uppercase tracking-wide opacity-80">Recommended</span>}
        </div>
        <p className="text-xs opacity-90 mt-1 leading-relaxed">
          {prfSupported
            ? "Sign in with your device's passkey. If you've used Charms before on any synced device, you'll see your wallet. If not, a fresh one is created — empty until you receive funds."
            : "Not supported on this browser. Use the latest Chrome, Safari or Edge for passkey access."}
        </p>
      </button>

      <button
        onClick={onImport}
        className="w-full text-left p-4 rounded-xl bg-dark-700 hover:bg-dark-600 text-white"
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold">Import a seed phrase</span>
        </div>
        <p className="text-xs opacity-90 mt-1 leading-relaxed">
          Paste a 12 or 24 word BIP39 mnemonic and protect it with a
          password. Use this to bring a wallet over from another app.
        </p>
      </button>

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
    </SetupShell>
  );
}
