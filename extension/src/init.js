/**
 * Extension Initialization
 *
 * Syncs persisted network preferences from chrome.storage.local into
 * the popup's ephemeral localStorage so that NetworkContext picks them up.
 */
import { GLOBAL_KEYS } from '@/services/storage-keys';

let initialized = false;

export async function initializeExtension() {
    if (initialized) return;

    try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
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
