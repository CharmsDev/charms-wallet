/**
 * Transfer Spell Builder (v10)
 *
 * Pure function — builds a human-friendly spell object from transfer parameters.
 * Does NOT normalize, does NOT call APIs.
 *
 * Supports:
 * - Single or multiple charm UTXOs as inputs
 * - Explicit funding UTXO for fees (charm UTXOs only have ~546 sats)
 * - Token change output when input amount exceeds transfer amount
 */

import { SPELL_VERSION, CHARM_DUST } from './constants.js';

/**
 * @param {object} p
 * @param {string}   p.tokenAppId        e.g. "t/3d7fe.../c975d4..."
 * @param {Array<{utxoId:string, amount:number}>} p.charmInputs  charm UTXOs to spend
 * @param {{utxoId:string, value:number}} p.fundingUtxo   plain BTC UTXO for fees
 * @param {number}   p.transferAmount    raw token units to send
 * @param {string}   p.recipientAddress  Bitcoin address of recipient
 * @param {string}   p.changeAddress     Bitcoin address for token change
 * @returns {object} spell object (human-friendly, not yet normalized)
 */
export function buildTransferSpell({
  tokenAppId,
  charmInputs,
  fundingUtxo,
  transferAmount,
  recipientAddress,
  changeAddress,
}) {
  if (!charmInputs?.length) throw new Error('At least one charm input is required');
  if (!fundingUtxo?.utxoId)  throw new Error('Funding UTXO is required');
  if (!recipientAddress)     throw new Error('Recipient address is required');
  if (transferAmount <= 0)   throw new Error('Transfer amount must be > 0');

  const apps = { '$00': tokenAppId };

  // Charm input(s) first, then funding UTXO
  const ins = [
    ...charmInputs.map(ci => ({ utxo_id: ci.utxoId })),
    { utxo_id: fundingUtxo.utxoId },
  ];

  const outs = [];

  // Output 0: tokens → recipient
  outs.push({
    address: recipientAddress,
    coin: CHARM_DUST,
    charms: { '$00': transferAmount },
  });

  // Output 1 (optional): remaining tokens → sender
  const totalInputTokens = charmInputs.reduce((sum, ci) => sum + ci.amount, 0);
  const remainingTokens = totalInputTokens - transferAmount;
  if (remainingTokens > 0) {
    if (!changeAddress) throw new Error('Change address is required for partial transfers');
    outs.push({
      address: changeAddress,
      coin: CHARM_DUST,
      charms: { '$00': remainingTokens },
    });
  }

  return {
    version: SPELL_VERSION,
    apps,
    ins,
    outs,
    private_inputs: { '$00': null },
  };
}
