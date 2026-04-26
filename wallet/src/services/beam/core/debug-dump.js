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
  if (typeof window !== 'undefined') {
    console.log(`[dump] ${prefix} spell:`, spellHuman);
    console.log(`[dump] ${prefix} payload:`, payload);
    // Trigger browser downloads so the user can send us the files (works on
    // any OS without dev/server fs access).
    triggerDownload(`${prefix}-spell-${ts}.json`, spellHuman);
    triggerDownload(`${prefix}-payload-${ts}.json`, payload);
  }
  await Promise.all([
    post(`${prefix}-spell-${ts}.json`, spellHuman),
    post(`${prefix}-payload-${ts}.json`, payload),
  ]);
}

function triggerDownload(filename, data) {
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { /* never break the caller */ }
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
