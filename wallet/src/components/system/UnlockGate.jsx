'use client';

/**
 * UnlockGate — wraps the rest of the app and renders WalletUnlock
 * instead of children when the wallet is locked.
 *
 * - status='checking'  → render nothing (brief flash; AuthContext is
 *                        probing storage for an auth blob)
 * - status='locked'    → render WalletUnlock overlay
 * - status='unlocked'  → render children
 */

import { useAuth } from '@/contexts/AuthContext';
import WalletUnlock from './WalletUnlock';

export default function UnlockGate({ children }) {
  const { status } = useAuth();

  if (status === 'checking') return null;
  if (status === 'locked')   return <WalletUnlock />;
  return children;
}
