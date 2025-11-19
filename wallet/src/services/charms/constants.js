/**
 * Charms Protocol Constants
 * Centralized configuration for spell composition and validation
 */

// Spell protocol version
export const SPELL_VERSION = 7;

// Minimum sats for outputs
export const MIN_SATS = 330;

// Bitcoin address validation patterns
export const ADDRESS_REGEX = {
  BITCOIN: /^(bc|tb)1[a-zA-HJ-NP-Z0-9]{8,87}$/,
  MAINNET: /^bc1[a-zA-HJ-NP-Z0-9]{8,87}$/,
  TESTNET: /^tb1[a-zA-HJ-NP-Z0-9]{8,87}$/
};

// BIP32/BIP86 derivation path constants
export const DERIVATION_PATHS = {
  BIP86_PURPOSE: "86'",
  DEFAULT_ACCOUNT: "0'",
  
  // Coin types per network (BIP44)
  COIN_TYPES: {
    BITCOIN_MAINNET: "0'",
    BITCOIN_TESTNET: "1'",  // BIP44 standard for all testnets
    CARDANO_MAINNET: "1815'",
    CARDANO_TESTNET: "1815'"  // Cardano uses same coin type for testnet
  }
};

// Charm types
export const CHARM_TYPES = {
  NFT: 'n',
  TOKEN: 't'
};

// Transaction fee rate (sats/vbyte)
export const DEFAULT_FEE_RATE = 2;
