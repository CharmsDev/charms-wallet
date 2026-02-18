/**
 * Extension initialization
 * Sets up storage adapter and performs any necessary migrations
 */
import { migrateFromLocalStorage } from './shared/storage-wrapper';

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
                chrome.storage.local.get(['active_blockchain', 'active_network'], resolve)
            );
            if (data.active_blockchain) {
                localStorage.setItem('active_blockchain', data.active_blockchain);
            }
            if (data.active_network) {
                localStorage.setItem('active_network', data.active_network);
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
