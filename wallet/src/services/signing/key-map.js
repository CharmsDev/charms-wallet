/**
 * Derive the private keys behind a set of wallet addresses.
 *
 * An address only lands in the map when the key we derive actually
 * reproduces it. That makes the map self-validating: an address the
 * wallet does not own yields no key instead of a wrong signature, which
 * is what lets a caller pass an address list from an untrusted side of
 * the wire without the list becoming an instruction.
 */

import * as bitcoin from 'bitcoinjs-lib';
import * as bip39 from 'bip39';
import { bip32 } from './ecc.js';
import {
  getNetworkConfig,
  getBip86Path,
  getBip84Path,
  isP2wpkhAddress,
} from './network.js';

/**
 * @param {string} seedPhrase BIP39 mnemonic
 * @param {string} networkName 'mainnet' | 'testnet4'
 * @param {Array<{address:string,index?:number,isChange?:boolean}|string>} addresses
 * @returns {Promise<Map<string, {privateKey:Buffer, publicKey:Buffer, xOnlyPubKey?:Buffer, type:'p2wpkh'|'p2tr', index:number, isChange:boolean}>>}
 */
export async function deriveKeyMap(seedPhrase, networkName, addresses) {
  const network = getNetworkConfig(networkName);
  const seed = await bip39.mnemonicToSeed(seedPhrase);
  const root = bip32.fromSeed(seed, network);

  // BIP86 (P2TR) nodes
  const bip86Account = root.derivePath(getBip86Path(networkName));
  const bip86Receive = bip86Account.derive(0);
  const bip86Change = bip86Account.derive(1);

  // BIP84 (P2WPKH) nodes
  const bip84Account = root.derivePath(getBip84Path(networkName));
  const bip84Receive = bip84Account.derive(0);

  const keyMap = new Map();

  for (const addrObj of addresses || []) {
    const addr = addrObj.address || addrObj;
    const index = addrObj.index ?? 0;
    const isChange = addrObj.isChange ?? false;

    if (isP2wpkhAddress(addr)) {
      // BIP84 P2WPKH — only the receive chain for now
      const child = bip84Receive.derive(index);
      const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: child.publicKey, network });
      if (p2wpkh.address === addr) {
        keyMap.set(addr, {
          privateKey: child.privateKey,
          publicKey: child.publicKey, // full 33-byte compressed
          type: 'p2wpkh',
          index,
          isChange,
        });
      }
    } else {
      // BIP86 P2TR
      const chain = isChange ? bip86Change : bip86Receive;
      const child = chain.derive(index);
      const xOnlyPubKey = Buffer.from(child.publicKey.slice(1, 33));
      const p2tr = bitcoin.payments.p2tr({ internalPubkey: xOnlyPubKey, network });
      if (p2tr.address === addr) {
        keyMap.set(addr, {
          privateKey: child.privateKey,
          publicKey: child.publicKey,
          xOnlyPubKey,
          type: 'p2tr',
          index,
          isChange,
        });
      }
    }
  }

  return keyMap;
}
