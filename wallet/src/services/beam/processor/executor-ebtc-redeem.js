/**
 * eBTC Redeem Executor — ADA → BTC redeem (burn eBTC CNTs + release BTC from vault).
 *
 * 3-tx flow (minimum possible):
 *   1. BTC placeholder: dust P2WPKH UTXO (commitment for ADA beam-out)
 *   2. ADA beam-out: burn N% eBTC CNTs, keep the rest as change. beamed_outs → BTC placeholder hash
 *   3. BTC combined: beam_from ADA + vault UTXO input + Scrolls signs vault + release BTC
 *
 * Single spell on BTC side combines:
 *   - Token claim from ADA (via beamed_from)
 *   - Token burn (no token output)
 *   - Vault release (vault_in - released = vault_out)
 *
 * Saves checkpoint after every step. Idempotent: re-running skips completed steps.
 */

import { BEAM_PHASE } from '../core/types';
import { saveBeamState } from '../core/persistence';
import { getProverUrl, getMempoolBase, SPELL_VERSION } from '@/services/charm-transfer/constants';
import { Encoder } from 'cbor-x';

// ── eBTC constants ──────────────────────────────────────────────────────────

const EBTC_APP_ID = '0796f63ed48144b4ec69fb794fbc2290ae63acf945fb035d5474648b50ee43b6';
const EBTC_APP_VK = 'fd0cac892e457454be0212fa7d9a0e1517d5bd6a33aa7c66a1f10f55e375c290';
const EBTC_TOKEN_APP = `t/${EBTC_APP_ID}/${EBTC_APP_VK}`;
const EBTC_VAULT_APP = `c/${EBTC_APP_ID}/${EBTC_APP_VK}`;
const EBTC_POLICY_ID = '552b22f4989ea698fabbf6314b70d2e5edb49c1fdbdeb6096e8c84b6';
const VAULT_ADDR = 'bc1qrn970793udj0ugc3pj0hyrptts4rw5n7qxeya2';
const VAULT_DEST = '00141ccbe7f8b1e364fe23110c9f720c2b5c2a37527e';
const VAULT_NONCE = 1129595493;
const SCROLLS_BTC_API = 'https://scrolls-v13.charms.dev';
const DUST_PER_VAULT = 300;
const DUST_PLACEHOLDER = 546;
const FEE_RATE = 2;

// ── CBOR helpers ────────────────────────────────────────────────────────────

const cborEncoder = new Encoder({ mapsAsObjects: false });
function toHex(bytes) { return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''); }
function safeInt(n) { return typeof n === 'number' && n > 0xFFFFFFFF ? BigInt(Math.round(n)) : n; }
function objectToMap(v) {
  if (v === null || v === undefined) return v;
  if (typeof v === 'bigint') return v;
  if (v instanceof Uint8Array) return v;
  if (Array.isArray(v)) return v.map(objectToMap);
  if (v instanceof Map) { const m = new Map(); for (const [k, val] of v) m.set(objectToMap(k), objectToMap(val)); return m; }
  if (typeof v === 'number') return safeInt(v);
  if (typeof v === 'object') { const m = new Map(); for (const [k, val] of Object.entries(v)) m.set(k, objectToMap(val)); return m; }
  return v;
}
function cborToHex(v) { return toHex(cborEncoder.encode(objectToMap(v))); }

function utxoIdToBytes(s) {
  const [txH, vS] = s.split(':');
  const txB = new Uint8Array(32);
  for (let i = 0; i < 32; i++) txB[i] = parseInt(txH.substring(i * 2, i * 2 + 2), 16);
  txB.reverse();
  const b = new Uint8Array(36); b.set(txB, 0);
  new DataView(b.buffer).setUint32(32, parseInt(vS), true);
  return b;
}

function appToCborTuple(s) {
  const [tag, idHex, vkHex] = s.split('/');
  const id = [], vk = [];
  for (let i = 0; i < 64; i += 2) {
    id.push(parseInt(idHex.substring(i, i + 2), 16));
    vk.push(parseInt(vkHex.substring(i, i + 2), 16));
  }
  return [tag, id, vk];
}

function destToBytes(hexStr) {
  const bytes = new Uint8Array(hexStr.length / 2);
  for (let i = 0; i < hexStr.length; i += 2) bytes[i / 2] = parseInt(hexStr.substring(i, i + 2), 16);
  return bytes;
}

async function utxoIdHash(txid, vout) {
  const buf = new Uint8Array(36);
  const txidBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) txidBytes[i] = parseInt(txid.substring(i * 2, i * 2 + 2), 16);
  for (let i = 0; i < 32; i++) buf[i] = txidBytes[31 - i];
  new DataView(buf.buffer).setUint32(32, vout, true);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return toHex(new Uint8Array(hash));
}

function compactToDER(sig) {
  let r = sig.subarray(0, 32);
  let s = sig.subarray(32, 64);
  while (r.length > 1 && r[0] === 0 && !(r[1] & 0x80)) r = r.subarray(1);
  while (s.length > 1 && s[0] === 0 && !(s[1] & 0x80)) s = s.subarray(1);
  if (r[0] & 0x80) r = Buffer.concat([Buffer.from([0]), r]);
  if (s[0] & 0x80) s = Buffer.concat([Buffer.from([0]), s]);
  const total = 2 + r.length + 2 + s.length;
  return Buffer.concat([Buffer.from([0x30, total, 0x02, r.length]), r, Buffer.from([0x02, s.length]), s]);
}

// ── Main executor ───────────────────────────────────────────────────────────

export async function executeEbtcRedeem(params) {
  const { beamId, onPhase, signal } = params;
  const ctx = { ...params };
  const save = (phase) => saveBeamState(beamId, { phase, direction: 'ebtc-ada-to-btc', ...snapshot(ctx) });
  console.log('[eBTC-redeem] Starting. redeemAmount:', ctx.redeemAmount, 'cntUtxo:', ctx.cntUtxo);

  // ═══ Step 1: Create BTC placeholder ════════════════════════════════════
  if (!ctx.placeholderUtxo) {
    onPhase(BEAM_PHASE.CREATING_PLACEHOLDER, 'Creating BTC placeholder...');
    // Placeholder tx must be created from OUR own BTC address, not the dest
    const ph = await createBtcPlaceholder({
      btcAddress: ctx.btcOwnAddress || ctx.btcAddress,
      seedPhrase: ctx.seedPhrase,
      network: ctx.network,
      onStatus: m => onPhase(BEAM_PHASE.CREATING_PLACEHOLDER, m),
    });
    ctx.placeholderUtxo = ph.utxo;
    ctx.placeholderTxid = ph.txid;
    ctx.placeholderVout = ph.vout;
    save(BEAM_PHASE.WAITING_DEST_CONFIRM);
    console.log('[eBTC-redeem] Placeholder:', ctx.placeholderUtxo);
  }

  // Wait for placeholder confirmation (skip if we already progressed past this point)
  if (!ctx.beamToHash && !ctx.cardanoBeamOutTxHash) {
    onPhase(BEAM_PHASE.WAITING_DEST_CONFIRM, 'Waiting for placeholder confirmation...');
    await waitForBtcInMempool(ctx.placeholderTxid, ctx.network, signal);
    save(BEAM_PHASE.PROVING);
  }

  // ═══ Step 2: ADA beam-out ══════════════════════════════════════════════
  if (!ctx.cardanoBeamOutTxHash) {
    if (!ctx.beamToHash) {
      ctx.beamToHash = await utxoIdHash(ctx.placeholderTxid, ctx.placeholderVout);
      console.log('[eBTC-redeem] beamToHash:', ctx.beamToHash);
    }
    onPhase(BEAM_PHASE.PROVING, 'Proving ADA beam-out (5-10 min)...');
    const r = await proveAndBroadcastAdaBeamOut({
      ...ctx,
      onStatus: m => onPhase(BEAM_PHASE.PROVING, m),
    });
    ctx.cardanoBeamOutTxHash = r.cardanoBeamOutTxHash;
    ctx.cardanoTxCborHex = r.cardanoTxCborHex;
    save(BEAM_PHASE.WAITING_FINALITY);
    console.log('[eBTC-redeem] ADA beam-out:', ctx.cardanoBeamOutTxHash);
  }

  // Wait for Cardano finality (Mithril certification)
  if (!ctx.finalitySig) {
    onPhase(BEAM_PHASE.WAITING_FINALITY, 'Waiting for Cardano finality (typically 20-60 min)...');
    ctx.finalitySig = await waitForMithrilFinality(ctx.cardanoTxCborHex, signal,
      m => onPhase(BEAM_PHASE.WAITING_FINALITY, m));
    save(BEAM_PHASE.CLAIMING_DEST);
    console.log('[eBTC-redeem] Finality sig obtained');
  }

  // ═══ Step 3: BTC combined claim+burn+release ═══════════════════════════
  if (!ctx.btcRedeemTxid) {
    onPhase(BEAM_PHASE.CLAIMING_DEST, 'Building BTC redeem (combined claim+burn)...');

    if (!ctx.redeemSpellTxHex) {
      const r = await proveCombinedRedeem({
        ...ctx,
        onStatus: m => onPhase(BEAM_PHASE.CLAIMING_DEST, m),
      });
      ctx.redeemSpellTxHex = r.unsignedTxHex;
      // Persist re-verified / reselected resources so retry / next run uses fresh values
      ctx.vaultUtxo = r.resolvedVaultUtxo;
      ctx.vaultSats = r.resolvedVaultSats;
      ctx.remainingVault = r.resolvedRemainingVault;
      ctx.btcFundingUtxos = r.resolvedFundingUtxos;
      // Legacy single-field kept in sync for any consumer still reading it
      ctx.btcFundingUtxo = r.resolvedFundingUtxos?.[0]?.utxo || null;
      ctx.btcFundingSats = r.resolvedFundingUtxos?.[0]?.sats || null;
      save(BEAM_PHASE.CLAIMING_DEST);
    }

    onPhase(BEAM_PHASE.CLAIMING_DEST, 'Signing + Scrolls + broadcasting...');
    const { btcRedeemTxid } = await signScrollsAndBroadcastRedeem({
      ...ctx,
      onStatus: m => onPhase(BEAM_PHASE.CLAIMING_DEST, m),
    });
    ctx.btcRedeemTxid = btcRedeemTxid;
    save(BEAM_PHASE.COMPLETE);
    console.log('[eBTC-redeem] BTC redeem:', btcRedeemTxid);
  }

  onPhase(BEAM_PHASE.COMPLETE, 'eBTC redeem complete!');
  return {
    btcTxid: ctx.btcRedeemTxid,
    adaClaimTxid: ctx.cardanoBeamOutTxHash,
  };
}

// ── Step 1: BTC placeholder ─────────────────────────────────────────────────

async function createBtcPlaceholder({ btcAddress, seedPhrase, network, onStatus }) {
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
  const spendable = utxos.filter(u => u.status?.confirmed && u.value >= 2000).sort((a, b) => b.value - a.value);
  if (!spendable.length) throw new Error('No confirmed UTXO ≥ 2000 sats for placeholder funding');
  const funding = spendable[0];
  console.log('[eBTC-redeem:placeholder] funding:', funding.txid, funding.vout, funding.value, 'sats');

  const fundingTxHex = await fetch(`${mempoolBase}/tx/${funding.txid}/hex`).then(r => r.text());

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
  console.log('[eBTC-redeem:placeholder] broadcast:', broadcastTxid);

  return { utxo: `${broadcastTxid}:0`, txid: broadcastTxid, vout: 0 };
}

async function waitForBtcInMempool(txid, network, signal) {
  // Use wallet's mempool-service (routes through Charms Explorer first,
  // falls back to mempool.space) instead of hitting mempool.space directly.
  const { mempoolService } = await import('@/services/shared/mempool-service');
  for (let i = 0; i < 60; i++) {
    if (signal?.aborted) throw new Error('Cancelled');
    try {
      const data = await mempoolService.getTransaction(txid, network === 'mainnet' ? 'bitcoin' : 'testnet4');
      if (data) return;
    } catch {}
    await new Promise(r => setTimeout(r, 5000));
  }
  throw Object.assign(
    new Error('Placeholder transaction not yet visible. Click Retry to keep waiting — the transaction was broadcast and should propagate shortly.'),
    { code: 'BTC_MEMPOOL_TIMEOUT' }
  );
}

// ── Step 2: ADA beam-out ────────────────────────────────────────────────────

async function proveAndBroadcastAdaBeamOut({
  cntUtxo, ebtcBalance, redeemAmount, beamToHash,
  cardanoAddress, cardanoOwnAddress, seedPhrase, network, onStatus,
}) {
  const ownAddr = cardanoOwnAddress || cardanoAddress;
  const remainingEbtc = ebtcBalance - redeemAmount;

  // Fetch fresh ADA UTXOs and select collateral + funding via wallet's cardano API
  // (goes through /api/cardano proxy to avoid CORS on Koios)
  const { fetchUtxos: fetchCardanoUtxos, getCardanoTxCbor, submitCardanoTx } = await import('@/services/cardano/api');
  onStatus?.('Selecting Cardano collateral + funding...');
  const adaUtxos = await fetchCardanoUtxos(ownAddr);

  // fetchUtxos returns normalized shape: { txHash, outputIndex, lovelace, assets, ... }
  const cntU = adaUtxos.find(u => `${u.txHash}:${u.outputIndex}` === cntUtxo);
  if (!cntU) throw new Error('CNT UTXO not found in latest fetch');

  const pureAda = adaUtxos.filter(u => (!u.assets || u.assets.length === 0) && `${u.txHash}:${u.outputIndex}` !== cntUtxo);
  const collateral = pureAda.filter(u => BigInt(u.lovelace) >= 2_000_000n).sort((a, b) => Number(BigInt(a.lovelace) - BigInt(b.lovelace)))[0];
  if (!collateral) throw new Error('No collateral UTXO ≥ 2 ADA');
  const funding = pureAda.filter(u => `${u.txHash}:${u.outputIndex}` !== `${collateral.txHash}:${collateral.outputIndex}`)
    .filter(u => BigInt(u.lovelace) >= 7_000_000n).sort((a, b) => Number(BigInt(b.lovelace) - BigInt(a.lovelace)))[0];
  if (!funding) throw new Error('No funding UTXO ≥ 7 ADA');

  const collateralUtxoId = `${collateral.txHash}:${collateral.outputIndex}`;
  const fundingUtxoId = `${funding.txHash}:${funding.outputIndex}`;
  console.log('[eBTC-redeem:ada-out] collateral:', collateralUtxoId, 'funding:', fundingUtxoId);

  // Build CBOR spell
  onStatus?.('Building Cardano beam-out spell...');
  const csl = await import('@emurgo/cardano-serialization-lib-asmjs');
  const addrBytes = Array.from(csl.Address.from_bech32(cardanoAddress).to_bytes());

  const appPublicInputs = new Map();
  appPublicInputs.set(appToCborTuple(EBTC_TOKEN_APP), null);

  const outs = [new Map([[0, redeemAmount]])];
  if (remainingEbtc > 0) outs.push(new Map([[0, remainingEbtc]]));

  const beamToBytes = [];
  for (let i = 0; i < 64; i += 2) beamToBytes.push(parseInt(beamToHash.substring(i, i + 2), 16));
  const beamedOuts = new Map();
  beamedOuts.set(0, beamToBytes);

  const coins = [{ amount: 2_000_000, dest: addrBytes }];
  if (remainingEbtc > 0) coins.push({ amount: 2_000_000, dest: addrBytes });

  const normalizedSpell = {
    version: SPELL_VERSION,
    tx: { ins: [utxoIdToBytes(cntUtxo), utxoIdToBytes(fundingUtxoId)], outs, beamed_outs: beamedOuts, coins },
    app_public_inputs: appPublicInputs,
  };

  const spellHex = cborToHex(normalizedSpell);

  // Fetch prev txs CBOR (via proxy)
  const cntCbor = await getCardanoTxCbor(cntU.txHash);
  const fundingCbor = funding.txHash === cntU.txHash ? cntCbor : await getCardanoTxCbor(funding.txHash);
  const prevTxs = [{ cardano: cntCbor }];
  if (funding.txHash !== cntU.txHash) prevTxs.push({ cardano: fundingCbor });

  const payload = {
    spell: spellHex,
    app_private_inputs: { [EBTC_TOKEN_APP]: 'f6' },
    tx_ins_beamed_source_utxos: {},
    binaries: {},
    prev_txs: prevTxs,
    change_address: ownAddr,
    fee_rate: 0,
    chain: 'cardano',
    collateral_utxo: collateralUtxoId,
  };

  onStatus?.('Submitting to prover (5-10 min)...');
  const proverUrl = getProverUrl(network);
  const t0 = Date.now();
  const resp = await fetch(proverUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  console.log(`[eBTC-redeem:ada-out] prover: ${resp.status} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (!resp.ok) throw new Error(`Prover failed: ${await resp.text()}`);

  let cardanoTxCborHex = await resp.text();
  try {
    const parsed = JSON.parse(cardanoTxCborHex);
    if (parsed.cborHex) cardanoTxCborHex = parsed.cborHex;
    else if (Array.isArray(parsed) && parsed[0]?.cardano) cardanoTxCborHex = parsed[0].cardano;
    else if (parsed.cardano) cardanoTxCborHex = parsed.cardano;
  } catch {}

  // Sign
  onStatus?.('Signing Cardano tx...');
  const bip39 = await import('bip39');
  const entropy = bip39.mnemonicToEntropy(seedPhrase);
  const rootKey = csl.Bip32PrivateKey.from_bip39_entropy(Buffer.from(entropy, 'hex'), Buffer.alloc(0));
  const paymentKey = rootKey.derive(2147485500).derive(2147485463).derive(2147483648).derive(0).derive(0);
  const fixedTx = csl.FixedTransaction.from_bytes(Buffer.from(cardanoTxCborHex, 'hex'));
  fixedTx.sign_and_add_vkey_signature(paymentKey.to_raw_key());
  const signedBytes = fixedTx.to_bytes();
  const cardanoBeamOutTxHash = fixedTx.transaction_hash().to_hex();

  // Submit via proxy
  onStatus?.('Submitting to Cardano...');
  try {
    await submitCardanoTx(signedBytes);
  } catch (err) {
    throw new Error(`Cardano submit failed: ${err.message}`);
  }

  return { cardanoBeamOutTxHash, cardanoTxCborHex };
}

async function waitForMithrilFinality(cardanoTxCborHex, signal, onStatus) {
  const { certifyFinal } = await import('@/services/scrolls/scrolls-cardano');
  // Typical finality: 20-60 min. Extreme cases (network congestion, epoch
  // boundaries) can take hours. We poll for 30 min per attempt; on timeout
  // we throw MITHRIL_TIMEOUT and the UI offers Retry — clicking resumes
  // polling for another 30 min. Nothing on-chain is lost, since the
  // Cardano beam-out is durable and we just need the certificate.
  const MAX = 30;
  for (let i = 1; i <= MAX; i++) {
    if (signal?.aborted) throw new Error('Cancelled');
    // Friendly status — no technical "Mithril" jargon
    const mins = i;
    onStatus?.(`Waiting for Cardano finality... (${mins} min elapsed)`);
    try {
      return await certifyFinal(cardanoTxCborHex);
    } catch (err) {
      if (!err.message?.includes('no certified transaction')) console.warn('[eBTC-redeem] finality check:', err.message);
    }
    await new Promise(r => setTimeout(r, 60_000));
  }
  throw Object.assign(
    new Error('Cardano finality is taking longer than usual. Click Retry to keep waiting — the Cardano beam-out is safely on-chain and the redeem will complete as soon as finality arrives.'),
    { code: 'MITHRIL_TIMEOUT' }
  );
}

// ── Step 3: Combined BTC redeem ─────────────────────────────────────────────

async function proveCombinedRedeem({
  placeholderUtxo, placeholderVout, vaultUtxo, vaultSats, redeemAmount, remainingVault,
  btcFundingUtxo, btcFundingSats, btcFundingUtxos, // single (legacy) or array [{utxo, sats}]
  cardanoBeamOutTxHash, cardanoTxCborHex, finalitySig,
  btcAddress, btcOwnAddress, network, onStatus,
}) {
  const mempoolBase0 = getMempoolBase(network);

  // ── Re-verify placeholder is still unspent ──────────────────────────────
  // The ADA beam-out has already committed to this exact placeholder hash.
  // If the user spent it, the redeem is unrecoverable — we must detect this
  // early with a clear error instead of letting the prover fail cryptically.
  onStatus?.('Verifying placeholder UTXO...');
  try {
    const phOutspend = await fetch(`${mempoolBase0}/tx/${placeholderUtxo.split(':')[0]}/outspend/${placeholderVout ?? placeholderUtxo.split(':')[1]}`).then(r => r.json());
    if (phOutspend?.spent) {
      throw Object.assign(new Error('Placeholder UTXO has been spent. This redeem is unrecoverable — the ADA beam-out already committed to it. Please contact support.'), { code: 'PLACEHOLDER_SPENT' });
    }
  } catch (e) {
    if (e.code === 'PLACEHOLDER_SPENT') throw e;
    console.warn('[eBTC-redeem:prove] Placeholder check failed (continuing):', e.message);
  }

  // ── Re-verify vault UTXO (or re-select) ─────────────────────────────────
  onStatus?.('Re-verifying vault UTXO...');
  const vaultList = await fetch(`${mempoolBase0}/address/${VAULT_ADDR}/utxo`).then(r => r.json()).catch(() => []);
  const currentVaultIds = new Set(vaultList.filter(u => u.status?.confirmed).map(u => `${u.txid}:${u.vout}`));
  if (!currentVaultIds.has(vaultUtxo)) {
    console.warn('[eBTC-redeem:prove] Stored vault UTXO no longer available, reselecting:', vaultUtxo);
    const minSats = redeemAmount + DUST_PER_VAULT;
    const fresh = vaultList
      .filter(u => u.status?.confirmed && u.value >= minSats)
      .sort((a, b) => a.value - b.value)[0];
    if (!fresh) throw Object.assign(new Error(`No confirmed vault UTXO ≥ ${minSats} sats available`), { code: 'NO_VAULT_UTXO' });
    vaultUtxo = `${fresh.txid}:${fresh.vout}`;
    vaultSats = fresh.value;
    remainingVault = vaultSats - redeemAmount;
    console.log('[eBTC-redeem:prove] Re-selected vault UTXO:', vaultUtxo, vaultSats, 'sats');
  } else {
    console.log('[eBTC-redeem:prove] Vault UTXO valid:', vaultUtxo, vaultSats, 'sats, remaining:', remainingVault);
  }

  // ── Funding UTXOs: verify + select (supports multi-UTXO consolidation) ──
  // Target: ≥ FUNDING_TARGET sats total across one or more confirmed P2WPKH UTXOs.
  //
  // IMPORTANT: Scrolls fee formula is
  //   fee = 895 + 64*num_inputs + (10/10000)*total_input_sats  (10 bps of total)
  // So a huge funding input inflates the required Scrolls fee disproportionately,
  // and the prover's auto-allocated Scrolls fee output falls short, causing
  // "insufficient fee" rejections. Strategy: pick the SMALLEST combination of
  // UTXOs that clears target. Prefer a single UTXO just above target over a
  // mega-UTXO. Keeps total_input small → Scrolls fee stays predictable.
  const FUNDING_TARGET = 6000;
  let fundingUtxos = []; // [{utxo, sats}]

  // Normalize incoming payload: accept array, legacy single, or nothing
  if (Array.isArray(btcFundingUtxos) && btcFundingUtxos.length) {
    fundingUtxos = btcFundingUtxos.map(u => ({ utxo: u.utxo, sats: u.sats }));
  } else if (btcFundingUtxo) {
    fundingUtxos = [{ utxo: btcFundingUtxo, sats: btcFundingSats }];
  }

  if (btcOwnAddress) {
    onStatus?.('Verifying BTC funding UTXOs...');
    let ownList = [];
    try {
      ownList = await fetch(`${mempoolBase0}/address/${btcOwnAddress}/utxo`).then(r => r.json()).catch(() => []);
    } catch (e) {
      console.warn('[eBTC-redeem:prove] Could not fetch own UTXOs:', e.message);
    }
    const ownMap = new Map();
    for (const u of ownList) {
      if (u.status?.confirmed) ownMap.set(`${u.txid}:${u.vout}`, u.value);
    }

    // Re-verify each stored funding UTXO is still confirmed + unspent
    const validStored = fundingUtxos.filter(f => ownMap.has(f.utxo));
    if (validStored.length !== fundingUtxos.length) {
      console.warn('[eBTC-redeem:prove] Some stored funding UTXOs no longer available:',
        fundingUtxos.filter(f => !ownMap.has(f.utxo)).map(f => f.utxo));
    }
    fundingUtxos = validStored;

    // Compute deficit and top up with SMALLEST viable combination:
    //  1. First try: single UTXO ≥ target, picking the smallest that qualifies
    //     (minimizes total_input → minimizes Scrolls fee).
    //  2. Fallback: accumulate smallest-first until target reached (consolidates
    //     dust without grabbing the mega-UTXO).
    const phId = placeholderUtxo;
    const vId = vaultUtxo;
    const usedIds = new Set(fundingUtxos.map(f => f.utxo));
    const available = Array.from(ownMap.entries())
      .filter(([id]) => id !== phId && id !== vId && !usedIds.has(id))
      .map(([utxo, sats]) => ({ utxo, sats }))
      .sort((a, b) => a.sats - b.sats); // smallest first

    let total = fundingUtxos.reduce((s, f) => s + f.sats, 0);
    if (total < FUNDING_TARGET) {
      // Preferred: single smallest UTXO that clears target by itself
      const singleSufficient = available.find(u => u.sats >= FUNDING_TARGET);
      if (singleSufficient) {
        fundingUtxos.push(singleSufficient);
        total += singleSufficient.sats;
      } else {
        // Accumulate smallest-first to build up without grabbing huge UTXOs
        for (const cand of available) {
          if (total >= FUNDING_TARGET) break;
          fundingUtxos.push(cand);
          total += cand.sats;
        }
      }
    }

    if (fundingUtxos.length === 0) {
      console.warn('[eBTC-redeem:prove] No funding UTXOs available in', btcOwnAddress);
    } else {
      console.log('[eBTC-redeem:prove] Funding UTXOs:', fundingUtxos.length, 'total:', total, 'sats');
      fundingUtxos.forEach((f, i) => console.log(`  [${i}]`, f.utxo, f.sats, 'sats'));
    }
  }

  // Hard requirement: without enough funding the spell has no fee budget.
  const fundingTotal = fundingUtxos.reduce((s, f) => s + f.sats, 0);
  if (fundingTotal < FUNDING_TARGET) {
    // Tally total available (even below target) to tell user how much to add
    let available = 0;
    try {
      const ownList = await fetch(`${mempoolBase0}/address/${btcOwnAddress}/utxo`).then(r => r.json()).catch(() => []);
      for (const u of ownList) {
        if (u.status?.confirmed && `${u.txid}:${u.vout}` !== placeholderUtxo && `${u.txid}:${u.vout}` !== vaultUtxo) {
          available += u.value;
        }
      }
    } catch {}
    const needed = FUNDING_TARGET - available;
    throw Object.assign(
      new Error(`Insufficient BTC for fees. You have ${available} sats available, need at least ${FUNDING_TARGET}. Add ~${needed} sats to your wallet and click Retry.`),
      { code: 'INSUFFICIENT_FUNDS', available, needed, target: FUNDING_TARGET }
    );
  }

  // Load eBTC WASM. Required because this tx combines beam-claim with vault
  // release (burn semantics) — the prover needs the app binary to verify
  // token_delta == vault_delta. (Pure beams don't need it; redeem does.)
  onStatus?.('Loading ebtc.wasm...');
  const wasmResp = await fetch('/wasm/ebtc.wasm');
  if (!wasmResp.ok) throw new Error('Failed to load ebtc.wasm');
  const wasmBytes = new Uint8Array(await wasmResp.arrayBuffer());
  let wasmBinary = '';
  const chunk = 8192;
  for (let i = 0; i < wasmBytes.length; i += chunk) {
    wasmBinary += String.fromCharCode.apply(null, Array.from(wasmBytes.subarray(i, i + chunk)));
  }
  const wasmBase64 = btoa(wasmBinary);

  onStatus?.('Building combined redeem spell...');
  const appPublicInputs = new Map();
  appPublicInputs.set(appToCborTuple(EBTC_VAULT_APP), null);
  appPublicInputs.set(appToCborTuple(EBTC_TOKEN_APP), null);

  // outs + coins must be same length (prover constraint, per reference script
  // and burn.mjs). Both describe the vault state output and its sat amount.
  // The prover auto-adds Scrolls fee, user redeem, user change, and OP_RETURN
  // based on the eBTC WASM app's internal fee model — do NOT declare them here.
  const outs = [new Map([[0, null]])];
  const coins = [{ amount: remainingVault, dest: destToBytes(VAULT_DEST) }];

  // Inputs: placeholder (beamed_from) + vault + user funding(s) (covers fees)
  const ins = [utxoIdToBytes(placeholderUtxo), utxoIdToBytes(vaultUtxo)];
  for (const f of fundingUtxos) ins.push(utxoIdToBytes(f.utxo));

  const normalizedSpell = {
    version: SPELL_VERSION,
    tx: {
      ins,
      outs,
      coins,
    },
    app_public_inputs: appPublicInputs,
  };

  const spellHex = cborToHex(normalizedSpell);
  console.log('[eBTC-redeem:prove] spell:', spellHex.length, 'chars');

  // Fetch prev txs (dedup by txid to avoid sending duplicates to prover)
  const mempoolBase = getMempoolBase(network);
  const [phTxid] = placeholderUtxo.split(':');
  const [vaultTxid] = vaultUtxo.split(':');

  const prevTxIds = new Set();
  const prevTxs = [];
  async function addPrev(txid) {
    if (!txid || prevTxIds.has(txid)) return;
    const hex = await fetch(`${mempoolBase}/tx/${txid}/hex`).then(r => r.text());
    prevTxs.push({ bitcoin: hex });
    prevTxIds.add(txid);
  }
  await addPrev(phTxid);
  await addPrev(vaultTxid);
  for (const f of fundingUtxos) await addPrev(f.utxo.split(':')[0]);

  const cardanoPrevTx = { cardano: { tx: cardanoTxCborHex, signature: finalitySig } };
  prevTxs.push(cardanoPrevTx);

  const txInsBeamedSourceUtxos = { 0: [`${cardanoBeamOutTxHash}:0`, null] };

  const totalInput = 546 + vaultSats + fundingTotal;
  console.log('[eBTC-redeem:prove] placeholder:', placeholderUtxo, '(546 sats)');
  console.log('[eBTC-redeem:prove] vault:', vaultUtxo, '(', vaultSats, 'sats)');
  fundingUtxos.forEach((f, i) => console.log(`[eBTC-redeem:prove] funding[${i}]:`, f.utxo, '(', f.sats, 'sats) ← covers fees'));
  console.log('[eBTC-redeem:prove] remainingVault:', remainingVault, 'sats');
  console.log('[eBTC-redeem:prove] redeem:', redeemAmount, 'eBTC →', redeemAmount, 'sats');
  console.log('[eBTC-redeem:prove] total input:', totalInput, 'sats, coin out:', remainingVault, 'sats');
  console.log('[eBTC-redeem:prove] fee budget:', totalInput - remainingVault, 'sats (scrolls + miner + user change)');

  // Send the eBTC WASM (compiled with sp1-5.2.4 per ebtc-repo Cargo.lock).
  // Required because the spell declares vault + token contracts in
  // app_public_inputs — the prover must execute their logic to generate
  // the ZK proof. Server SP1 runtime must be compatible with our binary.
  const payload = {
    spell: spellHex,
    app_private_inputs: { [EBTC_VAULT_APP]: 'f6', [EBTC_TOKEN_APP]: 'f6' },
    tx_ins_beamed_source_utxos: txInsBeamedSourceUtxos,
    binaries: { [EBTC_APP_VK]: wasmBase64 },
    prev_txs: prevTxs,
    change_address: btcAddress,
    fee_rate: FEE_RATE,
    chain: 'bitcoin',
    collateral_utxo: null,
  };

  // Debug dump payload (without wasm) to help diagnose failures
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const totalInputSats = 546 + vaultSats + fundingTotal;
    const insDesc = [
      placeholderUtxo + ' (placeholder, 546 sats, beamed_from ADA)',
      vaultUtxo + ' (vault, ' + vaultSats + ' sats)',
    ];
    fundingUtxos.forEach((f, i) => insDesc.push(f.utxo + ` (funding[${i}], ${f.sats} sats)`));
    const debugData = {
      spell_human: {
        version: SPELL_VERSION,
        ins: insDesc,
        outs: ['{0: null} (vault state)'],
        coins: [remainingVault + ' sats → vault (prover auto-adds Scrolls fee, user redeem, change)'],
        beamed_from_source: cardanoBeamOutTxHash + ':0',
        apps: [EBTC_VAULT_APP + ' (tag 0)', EBTC_TOKEN_APP + ' (tag 1)'],
        total_input_sats: totalInputSats,
        funding_count: fundingUtxos.length,
        funding_total_sats: fundingTotal,
        total_coin_output_sats: remainingVault,
        fee_budget_sats: totalInputSats - remainingVault,
        user_should_get_approx_sats: redeemAmount,
      },
      spell_hex: spellHex,
      change_address: btcAddress,
      fee_rate: FEE_RATE,
      finality_sig_len: finalitySig?.length,
      cardano_tx_cbor_len: cardanoTxCborHex?.length,
    };
    await fetch('/api/debug-dump', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: `ebtc-redeem-btc-${ts}.json`, data: debugData }),
    }).catch(() => {});
    console.log('[eBTC-redeem:prove] debug dumped to _rjj/tmp/');
  } catch {}

  onStatus?.('Proving (5-10 min)...');
  const proverUrl = getProverUrl(network);
  const t0 = Date.now();
  const payloadJson = JSON.stringify(payload);
  const resp = await fetch(proverUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payloadJson });
  console.log(`[eBTC-redeem:prove] response: ${resp.status} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (!resp.ok) {
    const err = await resp.text();
    console.error('[eBTC-redeem:prove] prover error:', err);
    throw new Error(`Prover failed: ${err}`);
  }

  const result = await resp.json();
  const unsignedTxHex = Array.isArray(result) ? result[0]?.bitcoin : result?.bitcoin;
  if (!unsignedTxHex) throw new Error('No unsigned tx in response');
  return { unsignedTxHex, resolvedVaultUtxo: vaultUtxo, resolvedVaultSats: vaultSats, resolvedRemainingVault: remainingVault, resolvedFundingUtxos: fundingUtxos };
}

async function signScrollsAndBroadcastRedeem({
  redeemSpellTxHex, placeholderUtxo, placeholderVout, vaultUtxo,
  btcAddress, seedPhrase, network, onStatus,
}) {
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
  const scriptCode = bitcoin.payments.p2pkh({ pubkey }).output;

  const tx = bitcoin.Transaction.fromHex(redeemSpellTxHex);
  console.log(`[eBTC-redeem:sign] inputs=${tx.ins.length} outputs=${tx.outs.length}`);

  const mempoolBase = getMempoolBase(network);
  const [phTxid] = placeholderUtxo.split(':');
  const [vaultTxid, vaultVoutStr] = vaultUtxo.split(':');
  const vaultVout = parseInt(vaultVoutStr, 10);

  // Find input indices
  const phTxidBytes = Buffer.from(phTxid, 'hex').reverse();
  const vaultTxidBytes = Buffer.from(vaultTxid, 'hex').reverse();
  let phIdx = -1, vaultIdx = -1;
  for (let i = 0; i < tx.ins.length; i++) {
    if (Buffer.compare(tx.ins[i].hash, phTxidBytes) === 0 && tx.ins[i].index === placeholderVout) phIdx = i;
    if (Buffer.compare(tx.ins[i].hash, vaultTxidBytes) === 0 && tx.ins[i].index === vaultVout) vaultIdx = i;
  }
  if (phIdx < 0 || vaultIdx < 0) throw new Error(`Input idx not found: ph=${phIdx} vault=${vaultIdx}`);

  const phPrevHex = await fetch(`${mempoolBase}/tx/${phTxid}/hex`).then(r => r.text());
  const phPrevTx = bitcoin.Transaction.fromHex(phPrevHex);
  const phPrevOut = phPrevTx.outs[placeholderVout];

  // Sign placeholder + any prover-added P2WPKH input that matches our address
  const sighash = tx.hashForWitnessV0(phIdx, scriptCode, phPrevOut.value, bitcoin.Transaction.SIGHASH_ALL);
  const compactSig = Buffer.from(ecc.sign(Buffer.from(sighash), privkey));
  const derSig = compactToDER(compactSig);
  tx.setWitness(phIdx, [Buffer.concat([derSig, Buffer.from([0x01])]), pubkey]);

  for (let i = 0; i < tx.ins.length; i++) {
    if (i === phIdx || i === vaultIdx) continue;
    try {
      const inpTxid = Buffer.from(tx.ins[i].hash).reverse().toString('hex');
      const prevHex = await fetch(`${mempoolBase}/tx/${inpTxid}/hex`).then(r => r.text());
      const prevT = bitcoin.Transaction.fromHex(prevHex);
      const prevO = prevT.outs[tx.ins[i].index];
      if (Buffer.compare(prevO.script, p2wpkh.output) === 0) {
        const sh = tx.hashForWitnessV0(i, scriptCode, prevO.value, bitcoin.Transaction.SIGHASH_ALL);
        const sg = Buffer.from(ecc.sign(Buffer.from(sh), privkey));
        const ds = compactToDER(sg);
        tx.setWitness(i, [Buffer.concat([ds, Buffer.from([0x01])]), pubkey]);
        console.log(`[eBTC-redeem:sign] signed prover-added input ${i}`);
      }
    } catch {}
  }

  tx.setWitness(vaultIdx, []);
  const ourSignedHex = tx.toHex();

  // Scrolls signs vault input — needs prev_tx for EVERY input in tx order.
  // Fetch all prev_txs by iterating tx.ins, deduplicating by txid to avoid
  // redundant network calls (same source tx can fund multiple inputs).
  onStatus?.('Scrolls signing vault input...');
  const prevHexCache = new Map();
  prevHexCache.set(phTxid, phPrevHex);
  const scrollsPrevTxs = [];
  for (const inp of tx.ins) {
    const inpTxid = Buffer.from(inp.hash).reverse().toString('hex');
    let hex = prevHexCache.get(inpTxid);
    if (!hex) {
      hex = await fetch(`${mempoolBase}/tx/${inpTxid}/hex`).then(r => r.text());
      prevHexCache.set(inpTxid, hex);
    }
    scrollsPrevTxs.push(hex);
  }
  console.log(`[eBTC-redeem:sign] Scrolls prev_txs: ${scrollsPrevTxs.length} (one per input)`);

  const scrollsResp = await fetch(`${SCROLLS_BTC_API}/main/sign`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sign_inputs: [{ index: vaultIdx, nonce: VAULT_NONCE }],
      prev_txs: scrollsPrevTxs,
      tx_to_sign: ourSignedHex,
    }),
  });
  if (!scrollsResp.ok) throw new Error(`Scrolls failed: ${await scrollsResp.text()}`);

  const scrollsBody = await scrollsResp.text();
  let fullySignedHex;
  try {
    const parsed = JSON.parse(scrollsBody);
    fullySignedHex = parsed.tx || parsed.signed_tx || (typeof parsed === 'string' ? parsed : JSON.stringify(parsed));
  } catch { fullySignedHex = scrollsBody.trim(); }

  onStatus?.('Broadcasting...');
  const bResp = await fetch(`${mempoolBase}/tx`, { method: 'POST', body: fullySignedHex });
  if (!bResp.ok) throw new Error(`Broadcast failed: ${await bResp.text()}`);
  const btcRedeemTxid = (await bResp.text()).trim();
  return { btcRedeemTxid };
}

// ── Snapshot ────────────────────────────────────────────────────────────────

function snapshot(ctx) {
  return {
    direction: 'ebtc-ada-to-btc',
    tokenAppId: EBTC_TOKEN_APP,
    cntUtxo: ctx.cntUtxo,
    ebtcBalance: ctx.ebtcBalance,
    redeemAmount: ctx.redeemAmount,
    remainingEbtc: ctx.ebtcBalance - ctx.redeemAmount,
    vaultUtxo: ctx.vaultUtxo,
    vaultSats: ctx.vaultSats,
    remainingVault: ctx.remainingVault,
    cardanoAddress: ctx.cardanoAddress,
    cardanoOwnAddress: ctx.cardanoOwnAddress,
    btcAddress: ctx.btcAddress,
    btcOwnAddress: ctx.btcOwnAddress,
    btcFundingUtxo: ctx.btcFundingUtxo,
    btcFundingSats: ctx.btcFundingSats,
    btcFundingUtxos: ctx.btcFundingUtxos,
    btcNetwork: ctx.network,
    placeholderUtxo: ctx.placeholderUtxo,
    placeholderTxid: ctx.placeholderTxid,
    placeholderVout: ctx.placeholderVout,
    beamToHash: ctx.beamToHash,
    cardanoBeamOutTxHash: ctx.cardanoBeamOutTxHash,
    cardanoTxCborHex: ctx.cardanoTxCborHex,
    finalitySig: ctx.finalitySig,
    redeemSpellTxHex: ctx.redeemSpellTxHex,
    btcRedeemTxid: ctx.btcRedeemTxid,
  };
}
