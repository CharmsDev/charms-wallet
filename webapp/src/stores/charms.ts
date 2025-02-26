// src/stores/charms.ts
import { writable, get } from 'svelte/store';
import type { ProcessedCharm } from '@app-types/charms';
import type { UTXO } from '@app-types/utxo';
import { charmsService } from '@services/charms';

function createCharmsStore() {
  const { subscribe, set } = writable<ProcessedCharm[]>([]);
  const loading = writable(false);

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },
    async loadCharmsFromUTXOs(utxos: { [address: string]: UTXO[] }) {
      loading.set(true);
      const charms = await charmsService.getCharmsByUTXOs(utxos);
      set(charms);
      loading.set(false);
    },
    updateCharm(updatedCharm: ProcessedCharm) {
      set(
        [...get(charms)].map((charm) =>
          charm.uniqueId === updatedCharm.uniqueId ? updatedCharm : charm
        )
      );
    },
  };
}

export const charms = createCharmsStore();
