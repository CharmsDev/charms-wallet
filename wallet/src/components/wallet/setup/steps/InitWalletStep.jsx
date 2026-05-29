'use client';

import SetupShell from './SetupShell';

/** Terminal step — wizard's effect runs the address derivation +
 *  initial sync via walletStore.initializeWalletComplete. If anything
 *  fails the error surfaces here. */
export default function InitWalletStep({ error }) {
  return (
    <SetupShell title="Preparing your wallet">
      <p className="text-sm text-dark-300 text-center">
        Deriving addresses and syncing balances…
      </p>
      {error && <p className="text-xs text-red-400 break-words">{error}</p>}
    </SetupShell>
  );
}
