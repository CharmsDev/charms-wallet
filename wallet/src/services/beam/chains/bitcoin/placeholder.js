/**
 * Bitcoin placeholder helpers for ADA → BTC beam flows.
 *
 * The placeholder is a dust P2WPKH UTXO created at the user's own BTC address.
 * It commits to a beam_to hash (SHA256 of its utxo_id) which the Cardano
 * beam-out spell references. Only the creator can spend it → they're the only
 * one who can claim on Bitcoin.
 *
 * Exported:
 *   - createBtcPlaceholder({ btcAddress, seedPhrase, network, onStatus })
 *   - waitForBtcInMempool(txid, network, signal)
 *
 * Logic mirrors the proven eBTC redeem flow in executor-ebtc-redeem.js.
 */

import { getMempoolBase } from '@/services/charm-transfer/constants';
import { compactToDER } from './signer-utils';

const DUST_PLACEHOLDER = 546;
const FEE_RATE = 2;

/**
 * Create a dust P2WPKH placeholder UTXO at `btcAddress`.
 *
 * Signs and broadcasts a tx that spends one existing UTXO (≥2000 sats) and
 * creates two outputs: [546 sats placeholder, change back to self].
 *
 * @returns {Promise<{ utxo: string, txid: string, vout: number }>}
 */
export async function createBtcPlaceholder({ btcAddress, seedPhrase, network, onStatus }) {
  const bitcoin = await import('bitcoinjs-lib');
  const ecc = await import('tiny-secp256k1');
  const { BIP32Factory } = await import('bip32');
  const bip39 = await import('bip39');
  bitcoin.initEccLib(ecc);
  const bip32 = BIP32Factory(ecc);

  const seed = bip39.mnemonicToSeedSync(seedPhrase);
  const root = bip32.fromSeed(seed);
  const child = root.derivePath("m/84'/0'/0'/0/0");
  const pubkey = Buffer.from(child.publicKey);
  const privkey = Buffer.from(child.privateKey);
  const p2wpkh = bitcoin.payments.p2wpkh({ pubkey });
  if (p2wpkh.address !== btcAddress) throw new Error('BTC address mismatch');

  onStatus?.('Selecting funding UTXO from mempool...');
  const mempoolBase = getMempoolBase(network);
  const utxos = await fetch(`${mempoolBase}/address/${btcAddress}/utxo`).then(r => r.json());
  // Include unconfirmed (mempool) UTXOs — change from concurrent ops is spendable
  const spendable = utxos.filter(u => u.value >= 2000).sort((a, b) => b.value - a.value);
  if (!spendable.length) throw new Error('No Bitcoin UTXO ≥ 2000 sats for placeholder funding');
  const funding = spendable[0];

  const estVBytes = 140;
  const fee = estVBytes * FEE_RATE;
  const change = funding.value - DUST_PLACEHOLDER - fee;
  if (change < 546) throw new Error(`Change too small: ${change}`);

  const tx = new bitcoin.Transaction();
  tx.version = 2;
  tx.addInput(Buffer.from(funding.txid, 'hex').reverse(), funding.vout);
  tx.addOutput(p2wpkh.output, DUST_PLACEHOLDER);
  tx.addOutput(p2wpkh.output, change);

  const scriptCode = bitcoin.payments.p2pkh({ pubkey }).output;
  const sighash = tx.hashForWitnessV0(0, scriptCode, funding.value, bitcoin.Transaction.SIGHASH_ALL);
  const compactSig = Buffer.from(ecc.sign(Buffer.from(sighash), privkey));
  const derSig = compactToDER(compactSig);
  const sigWithType = Buffer.concat([derSig, Buffer.from([bitcoin.Transaction.SIGHASH_ALL])]);
  tx.setWitness(0, [sigWithType, pubkey]);

  const signedHex = tx.toHex();
  const txid = tx.getId();

  onStatus?.('Broadcasting placeholder...');
  const bResp = await fetch(`${mempoolBase}/tx`, { method: 'POST', body: signedHex });
  if (!bResp.ok) throw new Error(`Placeholder broadcast failed: ${await bResp.text()}`);
  const broadcastTxid = (await bResp.text()).trim();

  // Reserve the placeholder output so concurrent BTC ops (UTXO selectors,
  // sends, charm transfers) don't accidentally spend it before the claim
  // consumes it. The funding input is already on-chain spent.
  try {
    const { markBatch } = await import('@/services/utxo-reservations');
    markBatch('bitcoin', [
      { txid: funding.txid, vout: funding.vout },
      { txid: broadcastTxid, vout: 0 },
    ]);
  } catch (e) { console.warn('[BtcPlaceholder] reserve failed:', e?.message); }

  return { utxo: `${broadcastTxid}:0`, txid: broadcastTxid, vout: 0 };
}

/**
 * Poll mempool.space directly until a BTC tx is visible (or throw after ~5 min).
 *
 * We broadcast to mempool.space, so we poll the same endpoint — other Bitcoin
 * nodes (e.g. Charms Explorer's bitcoind) won't see the tx until p2p
 * propagation, which can take many seconds and pollutes the console with 404s.
 */
export async function waitForBtcInMempool(txid, network, signal) {
  const mempoolBase = getMempoolBase(network);
  // Poll indefinitely. The placeholder was broadcast successfully, so
  // propagation will eventually happen — there's no useful outcome from
  // giving up. Only exit conditions: tx visible (success) or user cancels.
  while (true) {
    if (signal?.aborted) throw new Error('Cancelled');
    try {
      const resp = await fetch(`${mempoolBase}/tx/${txid}`);
      if (resp.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 5000));
  }
}
