/**
 * Beam Executor — Linear orchestrator for BTC→ADA beam.
 *
 * 6 steps, each in its own file. Saves checkpoint after every step.
 * Can resume from any step after failure or browser restart.
 */

import { BEAM_PHASE } from '../core/types';
import { saveBeamState } from '../core/persistence';
import { createPlaceholder } from './steps/step1-placeholder';
import { waitForCardanoConfirm } from './steps/step2-wait-cardano';
import { proveBtcBeam } from './steps/step3-prove-btc';
import { signAndBroadcastBtc } from './steps/step4-sign-broadcast-btc';
import { waitForBtcFinal } from './steps/step5-wait-btc-finality';
import { claimOnCardano } from './steps/step6-claim-cardano';

export async function executeBeamOut(params) {
  const { beamId, onPhase, signal } = params;
  const ctx = { ...params };
  const save = (phase) => saveBeamState(beamId, { phase, direction: 'btc-to-ada', ...snapshot(ctx) });

  // Step 1: Create Cardano placeholder (skip if already created)
  if (!ctx.placeholderTxid) {
    onPhase(BEAM_PHASE.CREATING_PLACEHOLDER, 'Creating placeholder UTXO on Cardano...');
    const ph = await createPlaceholder({ ...ctx, onStatus: m => onPhase(BEAM_PHASE.CREATING_PLACEHOLDER, m) });
    ctx.placeholderTxid = ph.txHash;
    ctx.placeholderVout = ph.outputIndex;
    save(BEAM_PHASE.WAITING_DEST_CONFIRM);
  }

  // Step 2: Wait for Cardano confirmation (idempotent — polls chain)
  onPhase(BEAM_PHASE.WAITING_DEST_CONFIRM, 'Waiting for Cardano confirmation...');
  await waitForCardanoConfirm({ txHash: ctx.placeholderTxid, onStatus: m => onPhase(BEAM_PHASE.WAITING_DEST_CONFIRM, m), signal });
  save(BEAM_PHASE.BUILDING_SPELL);

  // Step 3: Build + prove BTC beam spell (skip if already proven)
  if (!ctx.spellTxHex) {
    onPhase(BEAM_PHASE.BUILDING_SPELL, 'Building beam spell...');
    const { spellTxHex, prevTxMap } = await proveBtcBeam({ ...ctx, onStatus: m => onPhase(BEAM_PHASE.PROVING, m) });
    ctx.spellTxHex = spellTxHex;
    ctx.prevTxMap = prevTxMap;
    save(BEAM_PHASE.SIGNING_SOURCE);
  }

  // Step 4: Sign + broadcast BTC (skip if already broadcast)
  if (!ctx.btcTxid) {
    onPhase(BEAM_PHASE.SIGNING_SOURCE, 'Signing Bitcoin transaction...');
    const { btcTxid } = await signAndBroadcastBtc({ ...ctx, onStatus: m => onPhase(BEAM_PHASE.BROADCASTING_SOURCE, m) });
    ctx.btcTxid = btcTxid;
    save(BEAM_PHASE.WAITING_FINALITY);
  }

  // Step 5: Wait for BTC finality (idempotent — polls chain)
  onPhase(BEAM_PHASE.WAITING_FINALITY, 'Waiting for Bitcoin finality...');
  await waitForBtcFinal({ btcTxid: ctx.btcTxid, network: ctx.network, onStatus: m => onPhase(BEAM_PHASE.WAITING_FINALITY, m), signal });
  save(BEAM_PHASE.CLAIMING_DEST);

  // Step 6: Claim on Cardano (skip if already claimed)
  if (!ctx.adaClaimTxid) {
    onPhase(BEAM_PHASE.CLAIMING_DEST, 'Claiming on Cardano...');
    const { adaClaimTxid } = await claimOnCardano({ ...ctx, onStatus: m => onPhase(BEAM_PHASE.CLAIMING_DEST, m) });
    ctx.adaClaimTxid = adaClaimTxid;
    save(BEAM_PHASE.COMPLETE);
  }

  onPhase(BEAM_PHASE.COMPLETE, 'Beam complete!');
  return { btcTxid: ctx.btcTxid, adaClaimTxid: ctx.adaClaimTxid };
}

function snapshot(ctx) {
  return {
    tokenAppId: ctx.tokenAppId,
    beamAmount: ctx.beamAmount,
    cardanoAddress: ctx.cardanoAddress,
    btcChangeAddress: ctx.btcChangeAddress,
    btcNetwork: ctx.network,
    adaNetwork: ctx.adaNetwork,
    charmInputs: ctx.charmInputs,
    fundingUtxo: ctx.fundingUtxo,
    inputSigningMap: ctx.inputSigningMap,
    placeholderTxid: ctx.placeholderTxid,
    placeholderVout: ctx.placeholderVout,
    spellTxHex: ctx.spellTxHex,
    btcTxid: ctx.btcTxid,
    adaClaimTxid: ctx.adaClaimTxid,
  };
}
