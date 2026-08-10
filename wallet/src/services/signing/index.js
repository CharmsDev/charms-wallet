/**
 * signing — PSBT and message signing primitives.
 *
 * Lives in wallet/src rather than in the extension because both surfaces
 * need it: the extension popup signs directly for a password wallet, and
 * the /extension-sign page signs on the extension's behalf when the
 * wallet is a passkey wallet and the ceremony has to run on this origin.
 *
 * Usage:
 *   import { signPsbtWithKeys, signMessageWithKeys } from '@/services/signing';
 */

export { deriveKeyMap } from './key-map.js';
export { signPsbtWithKeys } from './psbt-signer.js';
export { signMessageWithKeys } from './message-signer.js';
export {
  signInputByType,
  matchAndSignInput,
  signP2wpkhInput,
  signTaprootInput,
} from './psbt-inputs.js';
export {
  getNetworkConfig,
  getBip86Path,
  getBip84Path,
  isP2wpkhAddress,
} from './network.js';
