// Minimal service worker — present so Chrome/Edge consider the PWA
// installable. Intentionally does NOT cache anything: this is a
// wallet, content freshness matters and the app already works fully
// online. If we add offline support later, restrict it to static
// shell + read-only views, NEVER to anything that touches the
// encrypted seed or signing paths.

self.addEventListener('install', () => {
  // Skip waiting so updates apply on next reload without manual close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Pass-through fetch — required by some installability heuristics
// (Chrome ≤ 84 era; modern Chrome no longer requires a handler but
// keeping it is harmless and explicit).
self.addEventListener('fetch', () => {
  // no-op; the browser handles the request normally
});
