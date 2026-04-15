/**
 * Scrolls Cardano ICP Service
 *
 * Direct access to the Scrolls Cardano canister on Internet Computer.
 * Used for:
 *   - certify_final: Get Mithril-verified finality certificate (ADA→BTC beam-back)
 *   - finality_vkey: Get the Ed25519 public key used for finality signatures
 *
 * The `sign` method is NOT called from the wallet — the prover calls it server-side.
 *
 * Canister ID: tty7k-waaaa-aaaak-qvngq-cai
 */

import { Actor, HttpAgent } from '@dfinity/agent';
import { idlFactory } from './scrolls-cardano.did';

const SCROLLS_CARDANO_CANISTER_ID = 'tty7k-waaaa-aaaak-qvngq-cai';
const ICP_HOST = 'https://icp-api.io';

let actor = null;

async function getActor() {
  if (actor) return actor;

  const agent = new HttpAgent({ host: ICP_HOST });
  actor = Actor.createActor(idlFactory, {
    agent,
    canisterId: SCROLLS_CARDANO_CANISTER_ID,
  });

  return actor;
}

/**
 * Get a Mithril-verified finality certificate for a Cardano transaction.
 *
 * The canister:
 * 1. Verifies the tx is finalized on Cardano via Mithril
 * 2. Signs the tx body hash with FINALITY_VKEY
 * 3. Returns the Ed25519 signature hex
 *
 * This signature is used as the finality proof in ADA→BTC beam claims:
 *   --prev-txs "!cardano {tx: <cbor>, signature: <this_signature>}"
 *
 * @param {string} txCborHex - The Cardano transaction CBOR hex
 * @returns {Promise<string>} The finality signature hex (128 chars = 64 bytes Ed25519)
 * @throws If tx not yet certified by Mithril (retry after ~5-30 min)
 */
export async function certifyFinal(txCborHex) {
  const a = await getActor();
  const result = await a.certify_final(txCborHex);

  if ('Ok' in result) {
    return result.Ok;
  } else {
    throw new Error(result.Err);
  }
}

/**
 * Get the Ed25519 public key used for finality signatures.
 * @returns {Promise<string>} The finality vkey hex
 */
export async function getFinalityVkey() {
  const a = await getActor();
  const result = await a.finality_vkey();

  if ('Ok' in result) {
    return result.Ok;
  } else {
    throw new Error(result.Err);
  }
}
