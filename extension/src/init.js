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
        
        initialized = true;
        console.log('Charms Wallet Extension initialized');
    } catch (error) {
        console.error('Failed to initialize extension:', error);
        throw error;
    }
}

// Auto-initialize on import
initializeExtension().catch(console.error);
