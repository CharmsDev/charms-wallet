/**
 * Charm Synchronization Module
 *
 * Legacy module — charm sync is now handled by explorer-wallet-sync.js
 * which queries the Charms Explorer indexed API directly.
 *
 * This module is kept as a stub so existing imports don't break.
 */

export async function syncCharms() {
    // No-op: charm sync is performed by explorer-wallet-sync.js
    return { charmsFound: 0, charmsRemoved: 0, success: true, error: null };
}
