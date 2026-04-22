/**
 * Dev-only payload dump helper.
 *
 * In development mode (local `npm run dev`), posts the payload to
 * `/api/debug-dump`, which writes it to `_rjj/tmp/<filename>` for offline
 * inspection.
 *
 * In production the call is a no-op — no network traffic, no payload leaves
 * the browser. Next.js inlines `process.env.NODE_ENV` at build time, so the
 * fetch branch is dead-code-eliminated from the prod bundle.
 */
export async function dumpPayload(filename, data) {
  if (process.env.NODE_ENV !== 'development') return;
  try {
    await fetch('/api/debug-dump', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, data }),
    });
  } catch { /* best-effort — never break the caller */ }
}
