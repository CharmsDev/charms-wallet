/**
 * One-time ECC wiring for the signing modules.
 *
 * bitcoinjs-lib needs initEccLib before any Taproot operation and
 * BIP32Factory needs the same backend, so both are set up once here
 * instead of at the top of every signer.
 */

import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { BIP32Factory } from 'bip32';

bitcoin.initEccLib(ecc);

export const bip32 = BIP32Factory(ecc);
export { ecc };
