/**
 * extension-link — what the browser extension is allowed to adopt from
 * this wallet.
 *
 * The old "Transfer to extension" flow copied the plaintext seed into
 * extension storage by scraping localStorage for `wallet:seed_phrase`.
 * G003 deleted that key, so the flow was broken as well as wrong.
 *
 * This is the replacement, and it never moves a secret in the clear:
 *
 *   password wallet  the blob travels as ciphertext and the AAD is a
 *                    constant, so the same password unlocks it in the
 *                    extension. Full function on both sides.
 *   passkey wallet   the blob is metadata only, no key material. The
 *                    extension gets a watch-only wallet and delegates
 *                    signing back to this origin, where the ceremony
 *                    is valid.
 *
 * The address book comes along because it is public and because the
 * extension cannot derive it without the seed.
 */

import { StorageAdapter } from './storage-adapter';
import { SYSTEM_KEYS, DATA_TYPES, netKey } from './storage-keys';

const LINK_NETWORKS = ['mainnet', 'testnet4'];

/**
 * The exact key set that may cross. Both sides read this: the page sends
 * only these, and the extension's handler accepts only these. The seed
 * key is absent on purpose and its absence is enforced, not assumed.
 */
export function linkableKeys() {
  return [
    SYSTEM_KEYS.AUTH,
    SYSTEM_KEYS.VERSION,
    SYSTEM_KEYS.CREATED,
    SYSTEM_KEYS.ACTIVE_BLOCKCHAIN,
    SYSTEM_KEYS.ACTIVE_NETWORK,
    ...LINK_NETWORKS.map(net => netKey('bitcoin', net, DATA_TYPES.ADDRESSES)),
  ];
}

function parseMaybeJson(raw) {
  if (raw == null) return null;
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

/**
 * Read the linkable keys out of this origin's storage.
 *
 * @returns {Promise<{payload:Object, walletType:string|null, addressCount:number}>}
 */
export async function collectLinkPayload() {
  const payload = {};
  for (const key of linkableKeys()) {
    const value = await StorageAdapter.get(key);
    if (value != null) payload[key] = value;
  }

  const walletType = parseMaybeJson(payload[SYSTEM_KEYS.AUTH])?.type ?? null;

  const addressCount = LINK_NETWORKS.reduce((total, net) => {
    const list = parseMaybeJson(payload[netKey('bitcoin', net, DATA_TYPES.ADDRESSES)]);
    return total + (Array.isArray(list) ? list.length : 0);
  }, 0);

  return { payload, walletType, addressCount };
}
