/**
 * Auth service (G003) — passkey-derived or password-encrypted wallet.
 *
 * Two wallet types, picked once at setup and never switched:
 *
 *   Type 1 (PRF)      passkey is the wallet — mnemonic derived on
 *                     demand from WebAuthn PRF. Nothing secret on disk.
 *
 *   Type 2 (Password) mnemonic encrypted with PBKDF2-derived key.
 *                     Used for non-PRF browsers, imports, and legacy
 *                     plaintext migrations (preserves addresses).
 *
 * Every wallet — both types — uses a standard BIP39 mnemonic with
 * standard derivation paths (BIP86 BTC Taproot, CIP-1852 Cardano).
 * Cross-wallet portability guaranteed.
 *
 * See `.meshkore/docs/security/passkey-unlock.md` for the threat
 * model and detailed flows.
 */

// Capability + storage helpers
export { isPrfSupported } from './prf-derive';
export { isEnrolled, getWalletType, readBlob, removeBlob } from './blob';

// Type 1 (Pure PRF)
export { createPrfWallet, restorePrfWallet, unlockPrfWallet } from './wallet-prf';

// Type 2 (Password)
export { createPasswordWallet, unlockPasswordWallet } from './wallet-password';
export { validatePassword } from './password-crypt';

// Mnemonic helpers (shared by the wizard's import + create flows)
export { generateRandomMnemonic, validateMnemonic } from './seed-derive';
