'use client';

import SetupShell from './SetupShell';

/**
 * Welcome — single primary action ("My Charms wallet") + a small
 * import-seed-phrase fallback link.
 *
 * The button triggers PrfAccessStep which transparently handles both
 * "use existing passkey from iCloud / Google sync" AND "create new
 * if none found yet". The user never has to pick a path.
 *
 * Non-PRF browsers (Firefox / Linux) see the passkey card disabled
 * with a hint, and the import link becomes the only path.
 *
 * `extraAction` is consumed by the extension popup for its
 * "Transfer from Web Wallet" path.
 */
export default function WelcomeStep({ onPasskey, onImport, prfSupported, extraAction }) {
  return (
    <SetupShell title="Charms Wallet">
      <p className="text-sm text-dark-300 text-center">
        Sign in with your device passkey. If you don't have a Charms
        wallet yet, we'll create one for you.
      </p>

      <button
        onClick={onPasskey}
        disabled={!prfSupported}
        className="w-full text-left p-4 rounded-xl bg-gradient-to-r from-primary-500 to-blue-500 hover:opacity-90 text-white disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <div className="font-semibold">My Charms wallet</div>
        <p className="text-xs opacity-90 mt-1 leading-relaxed">
          {prfSupported
            ? "One tap with Face ID / Touch ID. Your wallet appears the same on every device synced via iCloud Keychain or Google Password Manager."
            : "Not supported on this browser. Use the latest Chrome, Safari or Edge for passkey access."}
        </p>
      </button>

      <button
        onClick={onImport}
        className="text-xs text-dark-400 hover:text-dark-200 underline w-full text-center pt-2"
      >
        Or import a 12 / 24 word seed phrase from another wallet
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
