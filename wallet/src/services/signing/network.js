/**
 * Bitcoin network constants shared by every signer.
 *
 * bitcoinjs-lib ships mainnet but has no testnet4 entry, and the two BIP
 * account paths differ only by coin type, so both live here rather than
 * being redeclared per signer.
 */

import * as bitcoin from 'bitcoinjs-lib';

const MAINNET = bitcoin.networks.bitcoin;

const TESTNET = {
  messagePrefix: '\x18Bitcoin Signed Message:\n',
  bech32: 'tb',
  bip32: { public: 0x043587cf, private: 0x04358394 },
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  wif: 0xef,
};

/** Anything that is not 'mainnet' is treated as testnet4. */
export function getNetworkConfig(networkName) {
  return networkName === 'mainnet' ? MAINNET : TESTNET;
}

/** BIP86 account path (P2TR). */
export function getBip86Path(networkName) {
  return networkName === 'mainnet' ? "m/86'/0'/0'" : "m/86'/1'/0'";
}

/** BIP84 account path (P2WPKH). */
export function getBip84Path(networkName) {
  return networkName === 'mainnet' ? "m/84'/0'/0'" : "m/84'/1'/0'";
}

/** Native segwit v0 is the only P2WPKH flavour this wallet derives. */
export function isP2wpkhAddress(addr) {
  return typeof addr === 'string' && (addr.startsWith('bc1q') || addr.startsWith('tb1q'));
}
