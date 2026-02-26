/**
 * WASM Loader for Charm Transfers
 * Loads toad-token.wasm (BRO token contract) as base64 for the prover payload.
 *
 * The prover expects: { binaries: { "<vk_hex>": "<wasm_base64>" } }
 * VK is extracted from the token app ID: "t/txid/<VK>"
 */

let cachedTokenWasm = null;

/**
 * Load a WASM file from the extension's public folder and return as base64.
 */
async function loadWasmAsBase64(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load WASM ${path}: ${res.status}`);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

/**
 * Extract VK (64-char hex) from an App ID string like "t/txid/VK"
 */
function extractVk(appId) {
  const parts = appId.split('/');
  if (parts.length === 3) {
    const vk = parts[2];
    if (/^[a-f0-9]{64}$/i.test(vk)) return vk;
  }
  if (/^[a-f0-9]{64}$/i.test(appId)) return appId;
  throw new Error(`Cannot extract VK from app ID: ${appId}`);
}

/**
 * Get binaries object for a token transfer.
 * For a simple BRO transfer, only the token WASM is needed.
 *
 * @param {string} tokenAppId  e.g. "t/3d7fe.../c975d4..."
 * @returns {Promise<Record<string, string>>}  { vk: base64wasm }
 */
export async function getTokenBinaries(tokenAppId) {
  if (!cachedTokenWasm) {
    cachedTokenWasm = await loadWasmAsBase64('./toad-token.wasm');
  }
  const vk = extractVk(tokenAppId);
  return { [vk]: cachedTokenWasm };
}

export function clearWasmCache() {
  cachedTokenWasm = null;
}
