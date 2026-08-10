// @vitest-environment happy-dom

/**
 * The wipe whitelist is the one place in this codebase where a mistake
 * costs funds rather than a re-sync: a password wallet keeps its encrypted
 * mnemonic in the auth blob and nowhere else, so a wipe that drops it
 * destroys the wallet of anyone who did not write down their phrase.
 *
 * The blob was missing from KEEP, which made the next CURRENT_VERSION bump
 * a wallet-destroying event. These tests exist so a future bump cannot
 * reintroduce that quietly.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ensureStorageVersion, CURRENT_VERSION } from './storage-version';
import { SYSTEM_KEYS, netKey, DATA_TYPES } from './storage-keys';

const PASSWORD_BLOB = JSON.stringify({
  version: 3,
  type: 'password',
  kdfSalt: 'c2FsdA==',
  kdfIter: 600000,
  iv: 'aXY=',
  ciphertext: 'Y2lwaGVy',
  enrolledAt: '2026-01-01T00:00:00.000Z',
});

describe('ensureStorageVersion', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps the auth blob when it wipes', async () => {
    localStorage.setItem(SYSTEM_KEYS.VERSION, '0');
    localStorage.setItem(SYSTEM_KEYS.AUTH, PASSWORD_BLOB);
    localStorage.setItem(netKey('bitcoin', 'mainnet', DATA_TYPES.UTXOS), '{"stale":true}');

    const wiped = await ensureStorageVersion();

    expect(wiped).toBe(true);
    expect(localStorage.getItem(SYSTEM_KEYS.AUTH)).toBe(PASSWORD_BLOB);
    expect(localStorage.getItem(netKey('bitcoin', 'mainnet', DATA_TYPES.UTXOS))).toBeNull();
    expect(localStorage.getItem(SYSTEM_KEYS.VERSION)).toBe(String(CURRENT_VERSION));
  });

  it('keeps a legacy plaintext seed when it wipes', async () => {
    localStorage.setItem(SYSTEM_KEYS.VERSION, '0');
    localStorage.setItem(SYSTEM_KEYS.SEED_PHRASE, 'abandon abandon about');
    localStorage.setItem(netKey('bitcoin', 'testnet4', DATA_TYPES.CHARMS), '[]');

    await ensureStorageVersion();

    expect(localStorage.getItem(SYSTEM_KEYS.SEED_PHRASE)).toBe('abandon abandon about');
    expect(localStorage.getItem(netKey('bitcoin', 'testnet4', DATA_TYPES.CHARMS))).toBeNull();
  });

  it('leaves keys outside our namespaces alone', async () => {
    localStorage.setItem(SYSTEM_KEYS.VERSION, '0');
    localStorage.setItem('someone-elses-key', 'not ours to delete');

    await ensureStorageVersion();

    expect(localStorage.getItem('someone-elses-key')).toBe('not ours to delete');
  });

  it('does nothing when the stored version is current', async () => {
    localStorage.setItem(SYSTEM_KEYS.VERSION, String(CURRENT_VERSION));
    localStorage.setItem(netKey('bitcoin', 'mainnet', DATA_TYPES.UTXOS), '{"fresh":true}');

    const wiped = await ensureStorageVersion();

    expect(wiped).toBe(false);
    expect(localStorage.getItem(netKey('bitcoin', 'mainnet', DATA_TYPES.UTXOS))).toBe('{"fresh":true}');
  });
});
