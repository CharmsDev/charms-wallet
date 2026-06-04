'use client';

import SetupShell from './SetupShell';

/**
 * Welcome — three affordances mapped to user intent:
 *
 *   1. "I'm setting up Charms for the first time"
 *        → createPrfWallet() — creates a passkey on THIS device.
 *          iCloud Keychain / Google Password Manager sync it to the
 *          user's other devices automatically. One biometric, no QR.
 *
 *   2. "I already have a Charms wallet on another device"
 *        → restorePrfWallet() — discovers the synced passkey via
 *          iCloud Keychain / Google Password Manager. One biometric,
 *          no QR if the sync is healthy.
 *
 *   3. Small link: "Import a seed phrase from another wallet"
 *        → Type 2 path: paste BIP39 mnemonic + password protect.
 *
 * Non-PRF browsers (Firefox / Linux) see the two PRF cards disabled
 * and only the import link is active.
 *
 * `extraAction` is consumed by the extension popup for its
 * "Transfer from Web Wallet" option.
 */
export default function WelcomeStep({ onCreate, onRestore, onImport, prfSupported, extraAction }) {
  return (
    <SetupShell title="Charms Wallet">
      <p className="text-sm text-dark-300 text-center">
        How would you like to get into your wallet?
      </p>

      <button
        onClick={onCreate}
        disabled={!prfSupported}
        className="w-full text-left p-4 rounded-xl bg-gradient-to-r from-primary-500 to-blue-500 hover:opacity-90 text-white disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold">I'm setting up Charms for the first time</span>
          {prfSupported && <span className="text-[10px] uppercase tracking-wide opacity-80">Recommended</span>}
        </div>
        <p className="text-xs opacity-90 mt-1 leading-relaxed">
          {prfSupported
            ? "Creates a passkey on this device. iCloud Keychain / Google Password Manager sync it to your other devices automatically — you'll see the same wallet everywhere."
            : "Not supported on this browser. Use the latest Chrome, Safari or Edge for passkey setup."}
        </p>
      </button>

      <button
        onClick={onRestore}
        disabled={!prfSupported}
        className="w-full text-left p-4 rounded-xl bg-dark-700 hover:bg-dark-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <div className="font-semibold">I already have a Charms wallet on another device</div>
        <p className="text-xs opacity-90 mt-1 leading-relaxed">
          {prfSupported
            ? "Uses your passkey synced from another Apple / Google device. One Face ID / Touch ID and your wallet appears here too."
            : "Requires passkey support — not available on this browser."}
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
