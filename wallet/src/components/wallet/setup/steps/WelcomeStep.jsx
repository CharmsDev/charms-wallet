'use client';

import SetupShell from './SetupShell';

/**
 * Welcome → Create new / Import existing.
 *
 * `extraAction` is used by the extension popup to surface its
 * "Transfer from Web Wallet" path without forking the wizard.
 */
export default function WelcomeStep({ onCreate, onImport, extraAction }) {
  return (
    <SetupShell title="Charms Wallet">
      <p className="text-sm text-dark-300 text-center">
        Create a new wallet or import an existing seed phrase.
      </p>
      <div className="space-y-3">
        <button onClick={onCreate} className="btn btn-primary w-full py-3">
          Create New Wallet
        </button>
        <button onClick={onImport} className="btn btn-secondary w-full py-3">
          Import Existing Wallet
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
      </div>
    </SetupShell>
  );
}
