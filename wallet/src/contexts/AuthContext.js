'use client';

/**
 * AuthContext — gates the wallet behind the unlock step.
 *
 * Wallet types (G003):
 *   - 'prf'      Type 1, pure PRF. Unlock = biometric → derive mnemonic
 *   - 'password' Type 2. Unlock = enter password → decrypt mnemonic
 *   - null       no enrolment yet (fresh device OR legacy plaintext)
 *
 * Lifecycle:
 *   1. On mount, read the blob → set `type` + 'locked' or 'unlocked'
 *   2. UnlockGate renders the unlock screen if status === 'locked'
 *   3. User completes the type-specific unlock → mnemonic in RAM →
 *      pushed into walletStore via setSeedPhrase → status='unlocked'
 *   4. Locking back happens only on:
 *      - explicit "Lock wallet" → lockNow() wipes the mnemonic
 *      - tab close / reload → RAM drops; next mount starts locked
 *
 * No idle auto-lock. Per-action confirmation lives at the dialog
 * level (Send, Beam, etc.) — not here.
 */

import {
  createContext, useContext, useState, useEffect, useCallback,
} from 'react';
import {
  isPrfSupported, getWalletType,
  unlockPrfWallet, unlockPasswordWallet,
} from '@/services/auth';
import { useWallet } from '@/stores/walletStore';

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export function AuthProvider({ children }) {
  const { setSeedPhrase } = useWallet();

  const [status, setStatus] = useState('checking');     // 'checking' | 'locked' | 'unlocked'
  const [walletType, setWalletType] = useState(null);   // 'prf' | 'password' | null
  const [error, setError] = useState(null);

  // Detect the wallet type on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await getWalletType();
      if (cancelled) return;
      setWalletType(t);
      setStatus(t ? 'locked' : 'unlocked');
    })();
    return () => { cancelled = true; };
  }, []);

  // Multi-tab lock detection. The `storage` event fires only on
  // cross-tab writes (own-tab changes don't trigger it). If another
  // tab calls lockNow() — which wipes seedPhrase from walletStore but
  // leaves the blob on disk untouched — we won't see that directly;
  // however if another tab deletes the wallet or completes setup, the
  // AUTH key changes and we re-read the type. Real cross-tab lock
  // sync requires a BroadcastChannel; we defer that to a follow-up.
  useEffect(() => {
    const onStorage = async (e) => {
      if (e.key && !e.key.includes('auth')) return;
      const t = await getWalletType();
      setWalletType(t);
      // If the auth blob was removed elsewhere (e.g. user deleted the
      // wallet in another tab), drop this tab's RAM seed too so we
      // don't keep operating on a wallet that no longer exists.
      if (!t) setSeedPhrase?.(null);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [setSeedPhrase]);

  const refreshWalletType = useCallback(async () => {
    const t = await getWalletType();
    setWalletType(t);
  }, []);

  const triggerUnlockPrf = useCallback(async () => {
    setError(null);
    try {
      const mnemonic = await unlockPrfWallet();
      setSeedPhrase?.(mnemonic);
      setStatus('unlocked');
    } catch (err) {
      setError(err.message || 'Unlock failed');
      throw err;
    }
  }, [setSeedPhrase]);

  const triggerUnlockPassword = useCallback(async (password) => {
    setError(null);
    try {
      const mnemonic = await unlockPasswordWallet({ password });
      setSeedPhrase?.(mnemonic);
      setStatus('unlocked');
    } catch (err) {
      setError(err.message || 'Unlock failed');
      throw err;
    }
  }, [setSeedPhrase]);

  const lockNow = useCallback(() => {
    setSeedPhrase?.(null);
    setStatus('locked');
  }, [setSeedPhrase]);

  /** Mark the session unlocked without re-prompting — used right
   *  after setup when the mnemonic is already in RAM. Re-reads the
   *  blob so `walletType` reflects the new state. */
  const markUnlocked = useCallback(async () => {
    setStatus('unlocked');
    await refreshWalletType();
  }, [refreshWalletType]);

  const value = {
    status,
    walletType,
    prfSupported: isPrfSupported(),
    error,
    triggerUnlockPrf,
    triggerUnlockPassword,
    lockNow,
    markUnlocked,
    refreshWalletType,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
