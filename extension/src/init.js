/**
 * Extension Initialization
 *
 * Syncs persisted network preferences from chrome.storage.local into
 * the popup's ephemeral localStorage so that NetworkContext picks them up.
 *
 * Also prints a [ChWlt boot] one-line diagnostic with the active
 * blockchain, network, and a chrome.storage size hint — useful when
 * smoke-testing a build to confirm it loaded the right manifest /
 * codebase.
 */
import { SYSTEM_KEYS } from '@/services/storage-keys';

let initialized = false;

export async function initializeExtension() {
    if (initialized) return;

    try {
        let bc = null, net = null, keyCount = 0;
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            const all = await new Promise(resolve =>
                chrome.storage.local.get(null, resolve)
            );
            keyCount = Object.keys(all || {}).length;
            bc = all[SYSTEM_KEYS.ACTIVE_BLOCKCHAIN] || null;
            net = all[SYSTEM_KEYS.ACTIVE_NETWORK] || null;
            if (bc)  localStorage.setItem(SYSTEM_KEYS.ACTIVE_BLOCKCHAIN, bc);
            if (net) localStorage.setItem(SYSTEM_KEYS.ACTIVE_NETWORK,    net);
        }

        initialized = true;
        const manifestVersion = (typeof chrome !== 'undefined' && chrome.runtime?.getManifest)
            ? chrome.runtime.getManifest().version
            : 'unknown';
        console.log(
            `[ChWlt boot] v${manifestVersion} | blockchain=${bc || '(none)'} | network=${net || '(none)'} | storage keys=${keyCount}`
        );
    } catch (error) {
        console.error('[ChWlt boot] Failed to initialize extension:', error);
        throw error;
    }
}

// Auto-initialize on import
initializeExtension().catch(console.error);
