/**
 * Extension initialization
 * Sets up storage adapter and performs any necessary migrations
 */
import { migrateFromLocalStorage } from './shared/storage-wrapper';
import { GLOBAL_KEYS } from '@/services/storage-keys';

let initialized = false;

export async function initializeExtension() {
    if (initialized) {
        return;
    }

    try {
        // Migrate from localStorage if this is first run
        await migrateFromLocalStorage();

        // Sync network preferences from chrome.storage.local → localStorage
        // so that NetworkContext (which reads localStorage) picks up the persisted values.
        // The extension popup's localStorage is ephemeral, so we must restore on every open.
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            const data = await new Promise(resolve =>
                chrome.storage.local.get([GLOBAL_KEYS.ACTIVE_BLOCKCHAIN, GLOBAL_KEYS.ACTIVE_NETWORK], resolve)
            );
            if (data[GLOBAL_KEYS.ACTIVE_BLOCKCHAIN]) {
                localStorage.setItem(GLOBAL_KEYS.ACTIVE_BLOCKCHAIN, data[GLOBAL_KEYS.ACTIVE_BLOCKCHAIN]);
            }
            if (data[GLOBAL_KEYS.ACTIVE_NETWORK]) {
                localStorage.setItem(GLOBAL_KEYS.ACTIVE_NETWORK, data[GLOBAL_KEYS.ACTIVE_NETWORK]);
            }
        }
        
        initialized = true;
        console.log('Charms Wallet Extension initialized');
    } catch (error) {
        console.error('Failed to initialize extension:', error);
        throw error;
    }
}

// Auto-initialize on import
initializeExtension().catch(console.error);
