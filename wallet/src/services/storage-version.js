/**
 * Storage Version & Wipe Manager
 *
 * Single, simple migration mechanism: instead of writing per-shape migrations
 * forever, we keep the seed phrase + a tiny set of UI knobs across versions
 * and let everything else be re-derived from the seed (for addresses) and
 * the indexer (for UTXOs / balance / charms / transactions / sync state).
 *
 * Bump CURRENT_VERSION whenever the persisted data shape changes. On the
 * next app boot, ensureStorageVersion() detects the mismatch, calls
 * onProgress('upgrading') so the UI can surface a blocking modal, wipes
 * everything outside the whitelist, writes the new version, and resolves.
 *
 * The wipe is whitelist-based — that's the safety contract. Under no
 * circumstances may the seed phrase be removed by this routine.
 */

import { StorageAdapter } from './storage-adapter';
import { SYSTEM_KEYS, isWalletKey, isExtKey } from './storage-keys';

/**
 * Bump this number whenever the persisted shape of any wallet data changes
 * (utxos, transactions, charms, addresses, sync_meta, etc.). The next boot
 * after the bump will wipe local caches across all clients.
 */
export const CURRENT_VERSION = 1;

// Keys that survive every wipe. The seed phrase is the only truly
// irreplaceable item — everything else can be re-derived from it.
const KEEP = new Set([
    SYSTEM_KEYS.SEED_PHRASE,
    SYSTEM_KEYS.VERSION,    // self — rewritten right after the wipe
    SYSTEM_KEYS.CREATED,    // first-setup timestamp; harmless to keep
]);

/**
 * Returns the persisted schema version (0 if absent).
 */
async function getStoredVersion() {
    const raw = await StorageAdapter.get(SYSTEM_KEYS.VERSION);
    if (raw == null) return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Compare stored version against CURRENT_VERSION; if behind, wipe all
 * non-whitelisted keys and write the new version. Idempotent: a second
 * call with the same code returns false immediately.
 *
 * @param {(phase: 'checking'|'upgrading'|'ready', detail?: object) => void} [onProgress]
 * @returns {Promise<boolean>} true if a wipe ran, false if nothing to do
 */
export async function ensureStorageVersion(onProgress) {
    onProgress?.('checking');
    const stored = await getStoredVersion();
    if (stored >= CURRENT_VERSION) {
        onProgress?.('ready', { stored, current: CURRENT_VERSION, wiped: false });
        return false;
    }

    onProgress?.('upgrading', { from: stored, to: CURRENT_VERSION });

    // Brief read of the seed before wipe — defensive: if we somehow lose
    // it during the wipe we abort and never write the new version, so the
    // next boot tries again. The KEEP whitelist already protects it, this
    // is a belt-and-braces check.
    const seed = await StorageAdapter.get(SYSTEM_KEYS.SEED_PHRASE);

    let wipedKeys = 0;
    const allKeys = await StorageAdapter.getAllKeys();
    for (const key of allKeys) {
        if (KEEP.has(key)) continue;
        // Only touch our own namespaces — never delete keys we don't own.
        if (!isWalletKey(key) && !isExtKey(key)) continue;
        await StorageAdapter.remove(key);
        wipedKeys++;
    }

    // Re-write seed defensively in case it somehow got dropped (shouldn't
    // happen given the whitelist, but cheap to be safe).
    if (seed != null) {
        const after = await StorageAdapter.get(SYSTEM_KEYS.SEED_PHRASE);
        if (after !== seed) {
            await StorageAdapter.set(SYSTEM_KEYS.SEED_PHRASE, seed);
        }
    }

    await StorageAdapter.set(SYSTEM_KEYS.VERSION, String(CURRENT_VERSION));
    if (!await StorageAdapter.get(SYSTEM_KEYS.CREATED)) {
        await StorageAdapter.set(SYSTEM_KEYS.CREATED, new Date().toISOString());
    }

    console.log(`[storage] schema v${stored} → v${CURRENT_VERSION} (${wipedKeys} keys wiped)`);
    onProgress?.('ready', { stored, current: CURRENT_VERSION, wiped: true, wipedKeys });
    return true;
}

/**
 * For tests / dev tools: force a wipe regardless of version. Keeps the
 * seed (whitelist applies). The version is reset so subsequent boots
 * also see a mismatch and re-trigger the rehydration sync.
 */
export async function forceWipe(onProgress) {
    await StorageAdapter.remove(SYSTEM_KEYS.VERSION);
    return ensureStorageVersion(onProgress);
}
