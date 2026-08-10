/**
 * Sign a PSBT with the wallet's keys. Mirrors UniSat's signPsbt contract,
 * which is what dApps written against a Bitcoin wallet provider expect.
 */

import * as bitcoin from 'bitcoinjs-lib';
import { getNetworkConfig } from './network.js';
import { deriveKeyMap } from './key-map.js';
import { signInputByType, matchAndSignInput } from './psbt-inputs.js';

/**
 * @param {string} psbtHex
 * @param {{autoFinalized?:boolean, toSignInputs?:Array<{index:number,address?:string}>}} options
 * @param {string} seedPhrase
 * @param {string} networkName 'mainnet' | 'testnet4'
 * @param {Array} addresses wallet addresses to derive keys for
 * @returns {Promise<string>} the PSBT hex with our signatures on it
 */
export async function signPsbtWithKeys(psbtHex, options, seedPhrase, networkName, addresses) {
  const network = getNetworkConfig(networkName);
  const keyMap = await deriveKeyMap(seedPhrase, networkName, addresses);
  const psbt = bitcoin.Psbt.fromHex(psbtHex, { network });

  const autoFinalized = options?.autoFinalized !== false;
  const toSignInputs = options?.toSignInputs;

  let signedCount = 0;

  if (toSignInputs && toSignInputs.length > 0) {
    // The caller named the inputs it wants signed. An address it names
    // that we cannot derive is an error, not something to skip.
    for (const { index, address } of toSignInputs) {
      const keyInfo = address ? keyMap.get(address) : null;
      if (keyInfo) {
        signInputByType(psbt, index, keyInfo, network);
        signedCount++;
      } else if (matchAndSignInput(psbt, index, keyMap, network)) {
        signedCount++;
      } else {
        throw new Error(`No key found for input ${index} (address: ${address})`);
      }
    }
  } else {
    // Sign every input we hold a key for and leave the rest alone: the
    // PSBT may be a partially signed multi-party transaction.
    for (let i = 0; i < psbt.inputCount; i++) {
      if (!psbt.data.inputs[i]?.witnessUtxo) continue;
      if (matchAndSignInput(psbt, i, keyMap, network)) signedCount++;
    }
  }

  console.log(`[signPsbt] signed ${signedCount} of ${psbt.inputCount} inputs`);

  if (autoFinalized) {
    for (let i = 0; i < psbt.inputCount; i++) {
      try {
        psbt.finalizeInput(i);
      } catch (e) {
        // Expected for inputs another party still has to sign.
        console.warn(`[signPsbt] finalizeInput(${i}) failed:`, e.message);
      }
    }
  }

  return psbt.toHex();
}
