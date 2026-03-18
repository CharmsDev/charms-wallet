/**
 * Lazy P2WPKH address derivation for existing wallets.
 *
 * Wallets created before the P2WPKH update only have P2TR (bc1p) addresses.
 * This module derives the BIP84 P2WPKH address from the seed phrase and
 * prepends it to storage so background.js can return it as accounts[0].
 */

import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { BIP32Factory } from 'bip32';
import * as bip39 from 'bip39';

bitcoin.initEccLib(ecc);
const bip32 = BIP32Factory(ecc);

const MAINNET = bitcoin.networks.bitcoin;
const TESTNET = {
  messagePrefix: '\x18Bitcoin Signed Message:\n',
  bech32: 'tb',
  bip32: { public: 0x043587cf, private: 0x04358394 },
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  wif: 0xef,
};

/**
 * If the stored address list has no P2WPKH address, derive one and prepend it.
 * Returns true if a new address was added, false otherwise.
 */
export async function ensureP2wpkhAddress(seedPhrase, networkName, blockchain = 'bitcoin') {
  const network = networkName === 'mainnet' ? MAINNET : TESTNET;
  const addrKey = `wallet:${blockchain}:${networkName}:addresses`;

  // Read current addresses
  const stored = await new Promise(resolve =>
    chrome.storage.local.get([addrKey], resolve)
  );
  let addresses = stored[addrKey];
  if (typeof addresses === 'string') {
    try { addresses = JSON.parse(addresses); } catch { addresses = []; }
  }
  if (!Array.isArray(addresses) || addresses.length === 0) return false;

  // Check if P2WPKH already exists
  const hasP2wpkh = addresses.some(a => {
    const addr = a?.address || a;
    return addr.startsWith('bc1q') || addr.startsWith('tb1q');
  });
  if (hasP2wpkh) return false;

  // Derive BIP84 address (index 0, receive chain)
  const seed = await bip39.mnemonicToSeed(seedPhrase);
  const root = bip32.fromSeed(seed, network);
  const bip84Path = (network.bech32 === 'bc') ? "m/84'/0'/0'" : "m/84'/1'/0'";
  const child = root.derivePath(bip84Path).derive(0).derive(0);
  const { address } = bitcoin.payments.p2wpkh({ pubkey: child.publicKey, network });

  // Prepend to address array and save
  addresses.unshift({
    address,
    index: 0,
    isChange: false,
    created: new Date().toISOString(),
  });
  await new Promise(resolve =>
    chrome.storage.local.set({ [addrKey]: JSON.stringify(addresses) }, resolve)
  );

  console.log('[lazy-p2wpkh] Derived and saved P2WPKH address:', address);
  return true;
}
