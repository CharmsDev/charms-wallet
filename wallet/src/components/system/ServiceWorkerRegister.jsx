'use client';

/**
 * ServiceWorkerRegister — fire-and-forget registration of /sw.js so
 * the PWA is installable. Skips in development to avoid SW caches
 * interfering with Next dev HMR. The SW itself doesn't cache anything
 * (see public/sw.js).
 */

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    navigator.serviceWorker.register('/sw.js').catch((err) => {
      // Non-fatal: PWA install is degraded but the app still runs.
      console.warn('[sw] registration failed:', err?.message);
    });
  }, []);

  return null;
}
