/**
 * Load a wasm binary from /public and return its base64 encoding.
 * Used by spells that declare on-chain validation logic (eBTC mint+beam,
 * eBTC combined redeem). Beam-only spells don't need the binary.
 */
export async function loadWasmBase64(path) {
  const resp = await fetch(path);
  if (!resp.ok) throw new Error(`Failed to load ${path}`);
  const bytes = new Uint8Array(await resp.arrayBuffer());
  let s = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(s);
}
