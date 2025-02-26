import { writable, get } from 'svelte/store';
import type { AddressEntry } from '@app-types/wallet';

function createAddressStore() {
  const { subscribe, set, update } = writable<AddressEntry[]>([]);

  return {
    subscribe,
    addAddress: (address: AddressEntry) => update(addresses => {
      const newAddresses = [...addresses, address];
      localStorage.setItem('wallet_addresses', JSON.stringify(newAddresses));
      return newAddresses;
    }),
    deleteAddress: async (address: string) => {
      // First update addresses
      update(addresses => {
        const newAddresses = addresses.filter(addr => addr.address !== address);
        localStorage.setItem('wallet_addresses', JSON.stringify(newAddresses));
        return newAddresses;
      });

      // Then clear UTXOs for this address
      const { utxos } = await import('@stores/utxos');
      const currentUtxos = get(utxos);
      const newUtxos = { ...currentUtxos };
      delete newUtxos[address];
      utxos.set(newUtxos);
    },
    loadAddresses: () => {
      const stored = localStorage.getItem('wallet_addresses');
      if (stored) {
        set(JSON.parse(stored));
      }
    },
    clear: async () => {
      localStorage.removeItem('wallet_addresses');
      set([]);

      // Also clear UTXOs when clearing addresses
      const { utxos } = await import('@stores/utxos');
      utxos.clear();
    }
  };
}

export const addresses = createAddressStore();
