/**
 * Storage Version & Wipe Manager
 *
 * Single, simple migration mechanism: instead of writing per-shape migrations
 * forever, we keep whatever holds the seed + a tiny set of UI knobs across
 * versions and let everything else be re-derived from the seed (for
 * addresses) and the indexer (for UTXOs / balance / charms / transactions /
 * sync state).
 *
 * Under G003 "whatever holds the seed" means the auth blob, not the
 * plaintext key. For a password wallet the blob IS the mnemonic, encrypted;
 * for a passkey wallet it is the credential the mnemonic derives from.
 * Either way, wiping it destroys the wallet.
 *
 * Bump CURRENT_VERSION whenever the persisted data shape changes. On the
 * next app boot, ensureStorageVersion() detects the mismatch, calls
 * onProgress('upgrading') so the UI can surface a blocking modal, wipes
 * everything outside the whitelist, writes the new version, and resolves.
 *
 * The wipe is whitelist-based — that's the safety contract. Under no
 * circumstances may the seed, in any of the forms it takes, be removed by
 * this routine.
 */

import { StorageAdapter } from './storage-adapter';
import { SYSTEM_KEYS, isWalletKey, isExtKey } from './storage-keys';

/**
 * Bump this number whenever the persisted shape of any wallet data changes
 * (utxos, transactions, charms, addresses, sync_meta, etc.). The next boot
 * after the bump will wipe local caches across all clients.
 */
export const CURRENT_VERSION = 1;

// Keys that survive every wipe. Everything irreplaceable, and nothing
// else — the rest is re-derivable from the seed or the indexer.
const KEEP = new Set([
    // G003 auth blob. This is the wallet: a password wallet keeps its
    // encrypted mnemonic here and nowhere else, so wiping it loses the
    // funds of anyone who did not write down their phrase. It was missing
    // from this list, which made the next CURRENT_VERSION bump a
    // wallet-destroying event.
    SYSTEM_KEYS.AUTH,
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

    // Brief read of the irreplaceable keys before the wipe — defensive: if
    // we somehow lose one we put it back and never write the new version on
    // a wallet we damaged. The KEEP whitelist already protects them, this
    // is a belt-and-braces check.
    const seed = await StorageAdapter.get(SYSTEM_KEYS.SEED_PHRASE);
    const authBlob = await StorageAdapter.get(SYSTEM_KEYS.AUTH);

    let wipedKeys = 0;
    const allKeys = await StorageAdapter.getAllKeys();
    for (const key of allKeys) {
        if (KEEP.has(key)) continue;
        // Only touch our own namespaces — never delete keys we don't own.
        if (!isWalletKey(key) && !isExtKey(key)) continue;
        await StorageAdapter.remove(key);
        wipedKeys++;
    }

    // Re-write defensively in case either somehow got dropped (shouldn't
    // happen given the whitelist, but cheap to be safe).
    if (seed != null) {
        const after = await StorageAdapter.get(SYSTEM_KEYS.SEED_PHRASE);
        if (after !== seed) {
            await StorageAdapter.set(SYSTEM_KEYS.SEED_PHRASE, seed);
        }
    }
    if (authBlob != null) {
        const after = await StorageAdapter.get(SYSTEM_KEYS.AUTH);
        if (after !== authBlob) {
            await StorageAdapter.set(SYSTEM_KEYS.AUTH, authBlob);
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
