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
const SCROLLS_BTC_API = 'https://scrolls-v11.charms.dev';
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
    const ph = await createBtcPlaceholder({
      btcAddress: ctx.btcAddress,
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

  // Wait for placeholder confirmation
  onPhase(BEAM_PHASE.WAITING_DEST_CONFIRM, 'Waiting for placeholder confirmation...');
  await waitForBtcInMempool(ctx.placeholderTxid, ctx.network, signal);
  save(BEAM_PHASE.PROVING);

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

  // Wait for Mithril finality
  if (!ctx.finalitySig) {
    onPhase(BEAM_PHASE.WAITING_FINALITY, 'Waiting for Cardano finality (Mithril, 20-60 min)...');
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
  const mempoolBase = getMempoolBase(network);
  for (let i = 0; i < 60; i++) {
    if (signal?.aborted) throw new Error('Cancelled');
    try {
      const r = await fetch(`${mempoolBase}/tx/${txid}`);
      if (r.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error('Placeholder not found in mempool after 5 min');
}

// ── Step 2: ADA beam-out ────────────────────────────────────────────────────

async function proveAndBroadcastAdaBeamOut({
  cntUtxo, ebtcBalance, redeemAmount, beamToHash,
  cardanoAddress, cardanoOwnAddress, seedPhrase, network, onStatus,
}) {
  const ownAddr = cardanoOwnAddress || cardanoAddress;
  const remainingEbtc = ebtcBalance - redeemAmount;

  // Fetch fresh ADA UTXOs and select collateral + funding
  const koios = 'https://api.koios.rest/api/v1';
  onStatus?.('Selecting Cardano collateral + funding...');
  const utxos = await fetch(`${koios}/address_utxos`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ _addresses: [ownAddr], _extended: true }),
  }).then(r => r.json());

  const cntU = utxos.find(u => `${u.tx_hash}:${u.tx_index}` === cntUtxo);
  if (!cntU) throw new Error('CNT UTXO not found in latest fetch');

  const pureAda = utxos.filter(u => (!u.asset_list || u.asset_list.length === 0) && `${u.tx_hash}:${u.tx_index}` !== cntUtxo);
  const collateral = pureAda.filter(u => BigInt(u.value) >= 2_000_000n).sort((a, b) => parseInt(a.value) - parseInt(b.value))[0];
  if (!collateral) throw new Error('No collateral UTXO ≥ 2 ADA');
  const funding = pureAda.filter(u => `${u.tx_hash}:${u.tx_index}` !== `${collateral.tx_hash}:${collateral.tx_index}`)
    .filter(u => BigInt(u.value) >= 7_000_000n).sort((a, b) => parseInt(b.value) - parseInt(a.value))[0];
  if (!funding) throw new Error('No funding UTXO ≥ 7 ADA');

  const collateralUtxoId = `${collateral.tx_hash}:${collateral.tx_index}`;
  const fundingUtxoId = `${funding.tx_hash}:${funding.tx_index}`;
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

  // Fetch prev txs CBOR
  async function getTxCbor(txHash) {
    const r = await fetch(`${koios}/tx_cbor`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _tx_hashes: [txHash] }),
    });
    return (await r.json())[0]?.cbor;
  }
  const cntCbor = await getTxCbor(cntU.tx_hash);
  const fundingCbor = funding.tx_hash === cntU.tx_hash ? cntCbor : await getTxCbor(funding.tx_hash);
  const prevTxs = [{ cardano: cntCbor }];
  if (funding.tx_hash !== cntU.tx_hash) prevTxs.push({ cardano: fundingCbor });

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

  // Submit
  onStatus?.('Submitting to Cardano...');
  const submitResp = await fetch(`${koios}/submittx`, {
    method: 'POST', headers: { 'Content-Type': 'application/cbor' }, body: Buffer.from(signedBytes),
  });
  if (!submitResp.ok) throw new Error(`Cardano submit failed: ${await submitResp.text()}`);

  return { cardanoBeamOutTxHash, cardanoTxCborHex };
}

async function waitForMithrilFinality(cardanoTxCborHex, signal, onStatus) {
  const { certifyFinal } = await import('@/services/scrolls/scrolls-cardano');
  const MAX = 30;
  for (let i = 1; i <= MAX; i++) {
    if (signal?.aborted) throw new Error('Cancelled');
    onStatus?.(`Mithril attempt ${i}/${MAX}...`);
    try {
      return await certifyFinal(cardanoTxCborHex);
    } catch (err) {
      if (!err.message?.includes('no certified transaction')) console.warn('[eBTC-redeem] Mithril:', err.message);
    }
    await new Promise(r => setTimeout(r, 60_000));
  }
  throw new Error('Mithril finality timed out after 30 min');
}

// ── Step 3: Combined BTC redeem ─────────────────────────────────────────────

async function proveCombinedRedeem({
  placeholderUtxo, vaultUtxo, vaultSats, redeemAmount, remainingVault,
  cardanoBeamOutTxHash, cardanoTxCborHex, finalitySig,
  btcAddress, network, onStatus,
}) {
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

  const outs = [new Map([[0, null]])];  // remaining vault state only (no token output = burn)
  const coins = [{ amount: remainingVault, dest: destToBytes(VAULT_DEST) }];

  const normalizedSpell = {
    version: SPELL_VERSION,
    tx: {
      ins: [utxoIdToBytes(placeholderUtxo), utxoIdToBytes(vaultUtxo)],
      outs,
      coins,
    },
    app_public_inputs: appPublicInputs,
  };

  const spellHex = cborToHex(normalizedSpell);
  console.log('[eBTC-redeem:prove] spell:', spellHex.length, 'chars');

  // Fetch prev txs
  const mempoolBase = getMempoolBase(network);
  const [phTxid] = placeholderUtxo.split(':');
  const [vaultTxid] = vaultUtxo.split(':');
  const phPrevHex = await fetch(`${mempoolBase}/tx/${phTxid}/hex`).then(r => r.text());
  const vaultPrevHex = phTxid === vaultTxid ? phPrevHex : await fetch(`${mempoolBase}/tx/${vaultTxid}/hex`).then(r => r.text());

  const cardanoPrevTx = { cardano: { tx: cardanoTxCborHex, signature: finalitySig } };
  const prevTxs = [{ bitcoin: phPrevHex }];
  if (phTxid !== vaultTxid) prevTxs.push({ bitcoin: vaultPrevHex });
  prevTxs.push(cardanoPrevTx);

  const txInsBeamedSourceUtxos = { 0: [`${cardanoBeamOutTxHash}:0`, null] };

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

  onStatus?.('Proving (5-10 min)...');
  const proverUrl = getProverUrl(network);
  const t0 = Date.now();
  const resp = await fetch(proverUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  console.log(`[eBTC-redeem:prove] response: ${resp.status} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (!resp.ok) throw new Error(`Prover failed: ${await resp.text()}`);

  const result = await resp.json();
  const unsignedTxHex = Array.isArray(result) ? result[0]?.bitcoin : result?.bitcoin;
  if (!unsignedTxHex) throw new Error('No unsigned tx in response');
  return { unsignedTxHex };
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

  // Scrolls signs vault input
  onStatus?.('Scrolls signing vault input...');
  const vaultPrevHex = phTxid === vaultTxid ? phPrevHex : await fetch(`${mempoolBase}/tx/${vaultTxid}/hex`).then(r => r.text());
  const scrollsPrevTxs = [vaultPrevHex];
  if (phTxid !== vaultTxid) scrollsPrevTxs.unshift(phPrevHex);

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
