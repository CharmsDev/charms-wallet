import { writable } from 'svelte/store';
import type { ProcessedCharm } from '@app-types/charms';

interface TransferDialogState {
    isOpen: boolean;
    charm: ProcessedCharm | null;
}

function createTransferDialogStore() {
    const { subscribe, set, update } = writable<TransferDialogState>({
        isOpen: false,
        charm: null
    });

    return {
        subscribe,
        open: (charm: ProcessedCharm) => update(state => ({ ...state, isOpen: true, charm })),
        close: () => update(state => ({ ...state, isOpen: false, charm: null }))
    };
}

export const transferDialog = createTransferDialogStore();
