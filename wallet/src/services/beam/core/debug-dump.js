/**
 * Beam spell + payload dump for offline inspection.
 *
 * Writes two files to _rjj/tmp/ in local dev (`npm run dev`):
 *   - <prefix>-spell-<ts>.json    (human-readable spell)
 *   - <prefix>-payload-<ts>.json  (full prover payload with encoded spell)
 *
 * On Cloudflare prod it just console.logs — no fs available.
 * Comment out the call site in any executor to disable.
 */
export async function dumpBeamPayload(prefix, spellHuman, payload) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  await Promise.all([
    post(`${prefix}-spell-${ts}.json`, spellHuman),
    post(`${prefix}-payload-${ts}.json`, payload),
  ]);
}

async function post(filename, data) {
  try {
    await fetch('/api/debug-dump', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, data }),
    });
  } catch { /* never break the caller */ }
}
