'use client';

/**
 * AuthContext — locks the wallet behind a passkey unlock when the user
 * has enrolled (G002 / WebAuthn PRF).
 *
 * Lifecycle:
 *   1. On mount, check chrome.storage / localStorage for an auth blob
 *      (services/auth.isEnrolled()).
 *   2. If enrolled → state.locked = true; the UnlockGate component
 *      renders a fullscreen PasskeyUnlock prompt instead of children.
 *   3. User completes biometric → unlock() decrypts the seed → the
 *      plaintext is pushed into walletStore via the setter the
 *      WalletProvider exposes, then state.locked = false → children
 *      render.
 *
 * Locking back happens only when:
 *   - the user explicitly clicks "Lock wallet" (lockNow), OR
 *   - the tab is closed / reloaded — the next mount starts in 'locked'
 *     because the auth blob is on disk but the seed isn't in RAM.
 *
 * There is NO idle auto-lock: while the tab stays open, the session
 * stays unlocked. A user who wants stricter behaviour can close the
 * tab when they walk away.
 *
 * Non-enrolled users (or PRF-unsupported browsers) bypass this layer
 * entirely — `locked` stays false, no UI overlay, today's flow.
 */

import {
  createContext, useContext, useState, useEffect, useCallback,
} from 'react';
import {
  isPrfSupported, getAuthMethod,
  unlock as passkeyUnlock,
  unlockPassword,
  disable as authDisable,
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

  // Initial state: 'checking' while we look for an auth blob; then either
  // 'locked' (blob found, awaiting biometric), 'unlocked' (no blob OR
  // already unlocked this session), or 'unsupported' (PRF not available).
  const [status, setStatus] = useState('checking');
  // Active auth method: 'prf' | 'password' | null (none enrolled)
  const [method, setMethod] = useState(null);
  const [error, setError] = useState(null);

  // Detect enrollment + method on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const m = await getAuthMethod();
      if (cancelled) return;
      setMethod(m);
      setStatus(m ? 'locked' : 'unlocked');
    })();
    return () => { cancelled = true; };
  }, []);

  // Re-read blob from disk and update method/status. Used after the
  // MigrationGate or Settings flow writes a new blob.
  const refreshAuthState = useCallback(async () => {
    const m = await getAuthMethod();
    setMethod(m);
  }, []);

  const triggerUnlockPasskey = useCallback(async () => {
    setError(null);
    try {
      const seed = await passkeyUnlock();
      setSeedPhrase?.(seed);
      setStatus('unlocked');
    } catch (err) {
      setError(err.message || 'Unlock failed');
      throw err;
    }
  }, [setSeedPhrase]);

  const triggerUnlockPassword = useCallback(async (password) => {
    setError(null);
    try {
      const seed = await unlockPassword(password);
      setSeedPhrase?.(seed);
      setStatus('unlocked');
    } catch (err) {
      setError(err.message || 'Unlock failed');
      throw err;
    }
  }, [setSeedPhrase]);

  // Explicit lock — user clicked "Lock wallet" in the account menu.
  // Wipes the seed from RAM; the encrypted blob on disk stays so the
  // next unlock can decrypt again.
  const lockNow = useCallback(() => {
    setSeedPhrase?.(null);
    setStatus('locked');
  }, [setSeedPhrase]);

  const value = {
    status,                  // 'checking' | 'locked' | 'unlocked'
    method,                  // 'prf' | 'password' | null
    prfSupported: isPrfSupported(),
    error,
    triggerUnlockPasskey,
    triggerUnlockPassword,
    /** Legacy alias retained for callers still using the PRF-only API. */
    triggerUnlock: triggerUnlockPasskey,
    lockNow,
    refreshAuthState,
    /** Mark the session unlocked without re-prompting — used right
     *  after enrollment when we already hold the plaintext seed in
     *  memory. Re-reads the blob so `method` reflects the new state. */
    markUnlocked: async () => {
      setStatus('unlocked');
      await refreshAuthState();
    },
    /** Drop the auth blob (encryption disabled). Caller should ensure
     *  the plaintext seed is back in storage first, otherwise the
     *  wallet becomes unsignable. */
    disablePasskey: async () => {
      await authDisable();
      setMethod(null);
      setStatus('unlocked');
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
