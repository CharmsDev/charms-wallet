'use client';

/**
 * UnlockGate — wraps the rest of the app and renders PasskeyUnlock
 * instead of children when the wallet is locked.
 *
 * - status='checking'    → render nothing (brief flash; AuthContext is
 *                          probing storage for an auth blob)
 * - status='locked'      → render PasskeyUnlock overlay
 * - status='unlocked' /
 *   status='unsupported' → render children (today's flow)
 */

import { useAuth } from '@/contexts/AuthContext';
import PasskeyUnlock from './PasskeyUnlock';

export default function UnlockGate({ children }) {
  const { status } = useAuth();

  if (status === 'checking') return null;
  if (status === 'locked')   return <PasskeyUnlock />;
  return children;
}
