/**
 * useCardanoBootstrap
 *
 * Lazily initialises the Cardano store the first time the user switches
 * to the Cardano chain in the popup. Reads from storage, derives address
 * 0 if missing, then refreshes from the configured provider (Koios/
 * Blockfrost).
 *
 * No-op on Bitcoin chain. Safe to call repeatedly (the store's
 * `initialized` flag guards against duplicate work).
 */

import { useEffect, useRef } from 'react';
import { useBlockchain } from '@/stores/blockchainStore';
import { useCardano } from '@/stores/cardanoStore';
import { useWallet } from '@/stores/walletStore';

export function useCardanoBootstrap() {
  const { activeBlockchain, activeNetwork, isCardano } = useBlockchain();
  const { seedPhrase } = useWallet();
  const cardanoLoadFromStorage = useCardano(s => s.loadFromStorage);
  const cardanoDeriveAddresses = useCardano(s => s.deriveAddresses);
  const cardanoRefresh = useCardano(s => s.refresh);
  const cardanoInitialized = useCardano(s => s.initialized);

  const didBootstrap = useRef(false);

  useEffect(() => {
    if (!isCardano?.()) return;
    if (didBootstrap.current) return;
    if (!seedPhrase) return;

    didBootstrap.current = true;
    const cardanoNet = activeNetwork === 'mainnet' ? 'mainnet' : 'preprod';

    (async () => {
      console.log(`[ChWlt cardano] bootstrap start net=${cardanoNet}`);
      await cardanoLoadFromStorage(cardanoNet);
      const state = useCardano.getState();
      const before = state.addresses?.length || 0;
      if (!state.addresses?.length) {
        console.log('[ChWlt cardano] no addresses, deriving #0');
        await cardanoDeriveAddresses(seedPhrase, cardanoNet, 1);
      }
      await cardanoRefresh();
      const after = useCardano.getState();
      console.log(
        `[ChWlt cardano] bootstrap done | addresses=${after.addresses?.length || 0} (was ${before}) ` +
        `| ada=${after.adaBalance} | assets=${after.assets?.length || 0} | utxos=${after.utxos?.length || 0}`
      );
    })().catch((err) => {
      console.warn('[ChWlt cardano] bootstrap failed:', err.message);
      didBootstrap.current = false; // allow retry on next render
    });
  }, [
    isCardano, activeBlockchain, activeNetwork, seedPhrase,
    cardanoLoadFromStorage, cardanoDeriveAddresses, cardanoRefresh,
  ]);
}
