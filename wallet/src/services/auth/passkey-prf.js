/**
 * WebAuthn PRF — passkey unlock + seed encryption.
 *
 * Public API:
 *   isPrfSupported()              → boolean
 *   isEnrolled()                  → boolean
 *   enroll(seedPhrase, options?)  → { credentialId, enrolledAt }
 *   unlock()                      → plaintext seed phrase
 *   disable()                     → wipes the auth blob (after re-auth)
 *
 * The seed phrase NEVER touches network or persistent storage in
 * plaintext after enrollment. It lives in memory only for the duration
 * of the signing operation (caller is responsible for clearing it).
 *
 * Storage layout under SYSTEM_KEYS.AUTH (added to storage-keys.js):
 *   {
 *     version: 1,
 *     credentialId: base64url,
 *     prfSalt:      base64,
 *     iv:           base64,
 *     ciphertext:   base64,         // AES-GCM output incl. tag
 *     enrolledAt:   ISO string,
 *     rpId:         'charms.dev' | 'wallet.charms.dev' | ...
 *   }
 */

import { deriveSeedKey } from './derive-key';
import { importAesKey, encryptString, decryptString } from './aes-gcm';
import { readAuthBlob, writeAuthBlob, removeAuthBlob } from './blob';

// AAD changed between blob versions; reads must use the AAD that
// matches the blob the user actually enrolled with.
const AAD_PRF_V1 = 'charms-wallet/seed/v1';        // legacy reads only
const AAD_PRF_V2 = 'charms-wallet/seed-prf/v2';    // new enrollments
const RP_NAME = 'Charms Wallet';
const RP_ID_FALLBACK = 'localhost'; // dev only; production resolved from location

// ── codec helpers ───────────────────────────────────────────────────────────

function b64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function b64decode(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64url(bytes) {
  return b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return b64decode(s);
}

function getRpId() {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname;
    return host === 'localhost' ? 'localhost' : host;
  }
  return RP_ID_FALLBACK;
}

// ── feature detection ──────────────────────────────────────────────────────

/** True if the runtime exposes navigator.credentials + the PRF extension
 *  is plausibly available. Definitive check requires an actual create()
 *  attempt; this is a quick gate to hide UI on incompatible browsers. */
export function isPrfSupported() {
  if (typeof window === 'undefined') return false;
  if (!window.PublicKeyCredential) return false;
  if (typeof window.PublicKeyCredential.isConditionalMediationAvailable !== 'function') {
    // Older versions of the API; PRF was added later. Stay cautious.
    return false;
  }
  if (!window.crypto?.subtle) return false;
  return true;
}

// ── enrollment (two-phase) ──────────────────────────────────────────────────
//
// The setup wizard runs the passkey ceremony BEFORE the seed phrase
// exists or is shown to the user, so the seed never sits on disk in
// plaintext. To support that flow without two biometric prompts, we
// split enrollment in two:
//
//   beginEnrollment()              → biometric prompt, returns material
//                                    in RAM (prfBytes + credential).
//                                    Caller MUST wipe material soon.
//   commitEnrollment(seed, material) → encrypts seed, writes AUTH blob,
//                                    wipes prfBytes inside.
//
// enroll(seed) remains as a one-shot wrapper for the Settings-page
// post-hoc enrollment flow.

/**
 * Phase 1: run the WebAuthn create() ceremony and capture the PRF
 * material in memory. NO persistent state is written here.
 *
 * @param {object} options
 * @param {string} options.displayName - shown in the OS prompt
 * @returns {Promise<{prfBytes:Uint8Array, credentialId:Uint8Array, prfSalt:Uint8Array, rpId:string}>}
 */
export async function beginEnrollment(options = {}) {
  if (!isPrfSupported()) {
    throw new Error('Passkey PRF not supported by this browser / platform.');
  }

  const rpId = getRpId();
  const prfSalt = crypto.getRandomValues(new Uint8Array(32));
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userHandle = crypto.getRandomValues(new Uint8Array(16));
  const displayName = options.displayName || 'Charms Wallet user';

  let cred;
  try {
    cred = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { id: rpId, name: RP_NAME },
        user: { id: userHandle, name: 'charms-wallet', displayName },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'required',
        },
        timeout: 60_000,
        extensions: { prf: { eval: { first: prfSalt } } },
      },
    });
  } catch (err) {
    throw new Error(`Passkey enrollment cancelled or failed: ${err.message}`);
  }
  if (!cred) throw new Error('Passkey enrollment returned no credential.');

  const extResults = typeof cred.getClientExtensionResults === 'function'
    ? cred.getClientExtensionResults()
    : {};
  const prfResult = extResults?.prf?.results?.first;
  if (!prfResult) {
    throw new Error('This browser created a passkey without PRF support; cannot encrypt seed.');
  }

  return {
    prfBytes: new Uint8Array(prfResult),
    credentialId: new Uint8Array(cred.rawId),
    prfSalt,
    rpId,
  };
}

/**
 * Phase 2: encrypt the seed with material from beginEnrollment() and
 * persist the AUTH blob. Wipes prfBytes for the caller.
 *
 * @param {string} seedPhrase
 * @param {{prfBytes:Uint8Array, credentialId:Uint8Array, prfSalt:Uint8Array, rpId:string}} material
 * @returns {Promise<{credentialId:string, enrolledAt:string}>}
 */
export async function commitEnrollment(seedPhrase, material) {
  if (typeof seedPhrase !== 'string' || seedPhrase.trim().length === 0) {
    throw new Error('commitEnrollment: seedPhrase must be a non-empty string');
  }
  if (!material?.prfBytes || !material?.credentialId || !material?.prfSalt) {
    throw new Error('commitEnrollment: missing material from beginEnrollment()');
  }

  const aesRawKey = await deriveSeedKey(material.prfBytes);
  const aesKey = await importAesKey(aesRawKey);
  const { iv, ciphertext } = await encryptString(aesKey, seedPhrase, AAD_PRF_V2);

  material.prfBytes.fill(0);
  aesRawKey.fill(0);

  const blob = {
    version: 2,
    method: 'prf',
    credentialId: b64url(material.credentialId),
    prfSalt: b64(material.prfSalt),
    iv: b64(iv),
    ciphertext: b64(ciphertext),
    enrolledAt: new Date().toISOString(),
    rpId: material.rpId,
  };
  await writeAuthBlob(blob);

  return { credentialId: blob.credentialId, enrolledAt: blob.enrolledAt };
}

/** One-shot enrollment — used by the Settings post-hoc opt-in. */
export async function enroll(seedPhrase, options = {}) {
  const material = await beginEnrollment(options);
  return commitEnrollment(seedPhrase, material);
}

/** Helper for callers that abandon a beginEnrollment() — e.g. user
 *  cancels the next wizard step. Wipes the in-RAM material. The
 *  passkey itself remains on the authenticator; it has no on-disk
 *  trace, so it's effectively dead weight (orphan credential). */
export function abortEnrollment(material) {
  try { material?.prfBytes?.fill?.(0); } catch (_) {}
}

// ── unlock ──────────────────────────────────────────────────────────────────

/**
 * Run the WebAuthn get ceremony with the stored credentialId + prfSalt,
 * re-derive the AES key, decrypt the seed, return plaintext.
 *
 * Throws if no enrollment exists, if the user cancels the prompt, or if
 * decryption fails (AAD/tag mismatch — corruption or tampering).
 */
export async function unlock() {
  if (!isPrfSupported()) {
    throw new Error('Passkey PRF not supported by this browser / platform.');
  }
  const blob = await readAuthBlob();
  if (!blob) {
    throw new Error('No passkey enrollment found. Run enroll(seedPhrase) first.');
  }
  // v1 (legacy): no `method` field, implicit PRF, old AAD.
  // v2:          { method: 'prf' | 'password', ... }
  let aadForDecrypt;
  if (blob.version === 1) {
    aadForDecrypt = AAD_PRF_V1;
  } else if (blob.version === 2 && blob.method === 'prf') {
    aadForDecrypt = AAD_PRF_V2;
  } else if (blob.version === 2 && blob.method === 'password') {
    throw new Error('This wallet uses password unlock; call unlockPassword(password) instead.');
  } else {
    throw new Error(`Unknown auth blob version/method: v${blob.version}/${blob.method || '?'}`);
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const allowCredentials = [{
    id: b64urlDecode(blob.credentialId),
    type: 'public-key',
  }];
  const prfSalt = b64decode(blob.prfSalt);

  let assertion;
  try {
    assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials,
        userVerification: 'required',
        timeout: 60_000,
        rpId: blob.rpId,
        extensions: { prf: { eval: { first: prfSalt } } },
      },
    });
  } catch (err) {
    throw new Error(`Passkey unlock cancelled or failed: ${err.message}`);
  }

  if (!assertion) throw new Error('Passkey unlock returned no assertion.');

  const extResults = typeof assertion.getClientExtensionResults === 'function'
    ? assertion.getClientExtensionResults()
    : {};
  const prfResult = extResults?.prf?.results?.first;
  if (!prfResult) {
    throw new Error('Passkey assertion did not include a PRF result; cannot decrypt seed.');
  }
  const prfBytes = new Uint8Array(prfResult);
  const aesRawKey = await deriveSeedKey(prfBytes);
  const aesKey = await importAesKey(aesRawKey);
  const iv = b64decode(blob.iv);
  const ciphertext = b64decode(blob.ciphertext);

  const seedPhrase = await decryptString(aesKey, iv, ciphertext, aadForDecrypt);

  prfBytes.fill(0);
  aesRawKey.fill(0);

  return seedPhrase;
}

// ── disable ─────────────────────────────────────────────────────────────────

/** Remove the auth blob (any method). Caller is responsible for restoring
 *  a plaintext seed (or asking the user to re-import) before this;
 *  otherwise the wallet has no way to sign. */
export async function disable() {
  await removeAuthBlob();
}
