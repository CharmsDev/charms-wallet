/**
 * Auth service — passkey- or password-based unlock for the wallet's
 * local seed phrase. See ./passkey-prf.js (WebAuthn PRF) and
 * ./password-auth.js (PBKDF2) for the cryptographic flow.
 *
 * Initiative: G002 (see .meshkore/modules/general/tasks/).
 */

// Method-agnostic helpers
export { isEnrolled, getAuthMethod } from './blob';

// Passkey (WebAuthn PRF) path
export {
  isPrfSupported,
  enroll,
  beginEnrollment,
  commitEnrollment,
  abortEnrollment,
  unlock,
  disable,
} from './passkey-prf';

// Password path
export { enrollPassword, unlockPassword } from './password-auth';
export { validatePassword } from './password-kdf';
