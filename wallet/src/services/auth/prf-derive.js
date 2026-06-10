/**
 * WebAuthn PRF derivation — the engine for Type 1 (pure PRF) wallets.
 *
 * Two entry points:
 *
 *   enrollPrf({ displayName })
 *     Runs navigator.credentials.create() with a PRF eval extension.
 *     Returns the credential metadata + the PRF bytes from the first
 *     ceremony. Caller persists the metadata (NOT the bytes).
 *
 *   derivePrf({ credentialId, prfSalt, rpId })
 *     Runs navigator.credentials.get() with the stored metadata and
 *     the same PRF eval. Returns the 32 PRF bytes — bit-identical to
 *     what enrollPrf returned for this passkey + salt combination.
 *
 * The PRF output is the wallet root entropy. It never leaves RAM;
 * callers MUST `.fill(0)` the returned Uint8Array after deriving
 * downstream keys.
 *
 * Salt for the wallet root is hard-coded to `"charms"` in callers
 * (single wallet per passkey, by design).
 */

const RP_NAME = 'Charms Wallet';
const RP_ID_FALLBACK = 'localhost';
// Canonical RP id. Locked to one host so a passkey enrolled at any
// deploy URL (alchemy.charms.dev, alchemy-pk.pages.dev, wallet.charms.dev)
// shares the same WebAuthn scope. Cross-origin acceptance is authorised
// via `/.well-known/webauthn` served from this host.
const PRIMARY_RP_ID = 'wallet.charms.dev';

function getRpId() {
  if (typeof window === 'undefined') return RP_ID_FALLBACK;
  const host = window.location?.hostname;
  if (!host) return RP_ID_FALLBACK;
  if (host === 'localhost' || host === '127.0.0.1') return 'localhost';
  // Anything served from a charms.dev subdomain or a pages.dev preview
  // collapses into the canonical RP id. Same passkey across all URLs.
  if (host.endsWith('.charms.dev') || host.endsWith('.pages.dev')) {
    return PRIMARY_RP_ID;
  }
  return host;
}

/** Quick capability gate. Definitive PRF support requires an actual
 *  create() attempt — this just filters out obviously incompatible
 *  runtimes so we don't offer the passkey option in the UI. */
export function isPrfSupported() {
  if (typeof window === 'undefined') return false;
  if (!window.PublicKeyCredential) return false;
  if (typeof window.PublicKeyCredential.isConditionalMediationAvailable !== 'function') {
    return false;
  }
  if (!window.crypto?.subtle) return false;
  return true;
}

/**
 * Runs credentials.create() with PRF eval. Returns enrollment material
 * for storage + the PRF output for immediate use.
 *
 * @param {object} opts
 * @param {string} opts.displayName  shown in the OS prompt
 * @param {Uint8Array} opts.salt     32-byte PRF salt (deterministic per wallet)
 * @returns {Promise<{credentialId: Uint8Array, prfSalt: Uint8Array, rpId: string, prfBytes: Uint8Array}>}
 */
export async function enrollPrf({ displayName, salt }) {
  if (!isPrfSupported()) {
    throw new Error('WebAuthn PRF not supported in this environment.');
  }
  if (!(salt instanceof Uint8Array) || salt.length !== 32) {
    throw new Error('enrollPrf: salt must be 32 bytes');
  }

  const rpId = getRpId();
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userHandle = crypto.getRandomValues(new Uint8Array(16));

  let cred;
  try {
    cred = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { id: rpId, name: RP_NAME },
        user: { id: userHandle, name: 'charms-wallet', displayName: displayName || 'Charms Wallet user' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }], // ES256
        authenticatorSelection: {
          // 'platform' = use this device's built-in authenticator
          // (Touch ID / Face ID / Windows Hello / Android biometric).
          // Without this, Chrome's picker also shows QR cross-device
          // and security key options — confusing for a wallet on the
          // user's primary device. iCloud Keychain / Google Password
          // Manager still sync platform credentials across devices.
          authenticatorAttachment: 'platform',
          residentKey: 'required',
          userVerification: 'required',
        },
        timeout: 60_000,
        extensions: { prf: { eval: { first: salt } } },
      },
    });
  } catch (err) {
    throw new Error(`Passkey enrollment cancelled or failed: ${err.message}`);
  }
  if (!cred) throw new Error('Passkey enrollment returned no credential.');

  const prfResult = cred.getClientExtensionResults?.()?.prf?.results?.first;
  if (!prfResult) {
    throw new Error('Browser created the passkey but did not return PRF output — likely a PRF-incompatible authenticator.');
  }

  return {
    credentialId: new Uint8Array(cred.rawId),
    prfSalt: salt,
    rpId,
    prfBytes: new Uint8Array(prfResult),
  };
}

/**
 * Discover a passkey for this RP without knowing its credentialId.
 * Used on fresh devices where the user's passkey is synced (iCloud
 * Keychain / Google Password Manager) but no local blob exists.
 *
 * Returns { prfBytes, credentialId, rpId } on success, or null if
 * the user cancelled / no discoverable credentials were available.
 *
 * @param {Uint8Array} prfSalt
 */
export async function discoverPrf(prfSalt) {
  if (!isPrfSupported()) {
    throw new Error('WebAuthn PRF not supported in this environment.');
  }

  const rpId = getRpId();
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  let assertion;
  try {
    assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [],          // discoverable: browser surfaces any synced passkey for this RP
        userVerification: 'required',
        timeout: 60_000,
        rpId,
        extensions: { prf: { eval: { first: prfSalt } } },
      },
    });
  } catch (err) {
    // NotAllowedError on cancel / no creds → return null, let caller decide
    if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') return null;
    throw new Error(`Passkey lookup failed: ${err.message}`);
  }
  if (!assertion) return null;

  const prfResult = assertion.getClientExtensionResults?.()?.prf?.results?.first;
  if (!prfResult) {
    throw new Error('Discovered passkey but it did not produce PRF output.');
  }

  return {
    prfBytes: new Uint8Array(prfResult),
    credentialId: new Uint8Array(assertion.rawId),
    rpId,
  };
}

/**
 * Re-derive the PRF output from a stored credential.
 *
 * @param {object} blob  the stored Type 1 enrollment metadata
 * @param {Uint8Array} blob.credentialId
 * @param {Uint8Array} blob.prfSalt
 * @param {string} blob.rpId
 * @returns {Promise<Uint8Array>} 32 PRF bytes
 */
export async function derivePrf({ credentialId, prfSalt, rpId }) {
  if (!isPrfSupported()) {
    throw new Error('WebAuthn PRF not supported in this environment.');
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));

  let assertion;
  try {
    assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: credentialId, type: 'public-key' }],
        userVerification: 'required',
        timeout: 60_000,
        rpId,
        extensions: { prf: { eval: { first: prfSalt } } },
      },
    });
  } catch (err) {
    throw new Error(`Passkey unlock cancelled or failed: ${err.message}`);
  }
  if (!assertion) throw new Error('Passkey unlock returned no assertion.');

  const prfResult = assertion.getClientExtensionResults?.()?.prf?.results?.first;
  if (!prfResult) {
    throw new Error('Assertion did not include PRF output — authenticator may have lost PRF capability.');
  }

  return new Uint8Array(prfResult);
}
