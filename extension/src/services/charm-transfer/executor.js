/**
 * Charm Transfer Executor
 *
 * Orchestrates a BRO (or any charm) token transfer:
 * 1. Build spell (v10 format)
 * 2. Normalize spell → CBOR hex
 * 3. Fetch prev_txs for all spell inputs
 * 4. Load token WASM binary
 * 5. Send to prover → get unsigned spell TX
 * 6. Sign spell TX with user's seed phrase
 * 7. Broadcast via Explorer API
 */

import { normalizeSpell } from './spell-normalizer.js';
import { proveTransfer } from './prover-client.js';
import { fetchPrevTxs, fetchTxHex } from './tx-fetcher.js';
import { signSpellTx } from './tx-signer.js';
import { getTokenBinaries } from './wasm-loader.js';

const SPELL_VERSION = 10;
const CHARM_DUST = 546;   // sats — min output carrying a charm
const EXPLORER_API = import.meta.env.VITE_EXPLORER_WALLET_API_URL || 'https://charms-explorer-api.fly.dev';
const MEMPOOL_MAINNET = 'https://mempool.space/api';
const MEMPOOL_TESTNET = 'https://mempool.space/testnet4/api';

// ── Broadcast ─────────────────────────────────────────────────────────────────

async function broadcastTx(rawTxHex, network) {
  // Primary: Explorer API (supports large OP_RETURN from charms proof)
  try {
    const networkParam = network === 'mainnet' ? 'mainnet' : 'testnet4';
    const res = await fetch(`${EXPLORER_API}/v1/wallet/broadcast?network=${networkParam}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_tx: rawTxHex }),
    });
    const data = await res.json();
    if (res.ok && data?.txid) return data.txid;
    throw new Error(data?.error || `Explorer broadcast HTTP ${res.status}`);
  } catch (e) {
    console.warn('[CharmTransfer] Explorer broadcast failed, trying mempool:', e.message);
  }

  // Fallback: mempool.space
  const base = network === 'mainnet' ? MEMPOOL_MAINNET : MEMPOOL_TESTNET;
  const res = await fetch(`${base}/tx`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: rawTxHex,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Mempool broadcast failed: ${text.slice(0, 200)}`);
  return text.trim(); // txid
}

// ── Spell builder ─────────────────────────────────────────────────────────────

/**
 * Build a token transfer spell.
 *
 * @param {object} p
 * @param {string} p.tokenAppId        e.g. "t/3d7fe.../c975d4..."
 * @param {string} p.inputUtxoId       "txid:vout" of the UTXO carrying the token
 * @param {number} p.inputTokenAmount  raw token units in that UTXO
 * @param {number} p.transferAmount    raw token units to send
 * @param {string} p.recipientAddress  Bitcoin address of recipient
 * @param {string} p.senderAddress     Bitcoin address of sender (for change)
 */
function buildTransferSpell({
  tokenAppId,
  inputUtxoId,
  inputTokenAmount,
  transferAmount,
  recipientAddress,
  senderAddress,
}) {
  const apps = { '$00': tokenAppId };

  const ins = [{ utxo_id: inputUtxoId }];

  const outs = [];

  // Output 0: tokens → recipient
  outs.push({
    address: recipientAddress,
    coin: CHARM_DUST,
    charms: { '$00': transferAmount },
  });

  // Output 1 (optional): remaining tokens → sender
  const remainingTokens = inputTokenAmount - transferAmount;
  if (remainingTokens > 0) {
    outs.push({
      address: senderAddress,
      coin: CHARM_DUST,
      charms: { '$00': remainingTokens },
    });
  }

  return {
    version: SPELL_VERSION,
    apps,
    ins,
    outs,
    private_inputs: { '$00': null }, // token contract has no private inputs for transfer
  };
}

// ── Main executor ─────────────────────────────────────────────────────────────

/**
 * Execute a charm token transfer.
 *
 * @param {object} params
 * @param {string} params.tokenAppId
 * @param {string} params.inputUtxoId       "txid:vout"
 * @param {number} params.inputTokenAmount  raw token units (e.g. 100_000_000 for 1 BRO)
 * @param {number} params.transferAmount    raw token units to send
 * @param {string} params.recipientAddress
 * @param {string} params.senderAddress
 * @param {number} params.senderAddressIndex  BIP86 derivation index
 * @param {boolean} params.senderIsChange     BIP86 change path flag
 * @param {string} params.seedPhrase
 * @param {string} params.network            'mainnet' | 'testnet4'
 * @param {function} params.onStatus         (msg: string) => void
 * @returns {{ txid: string }}
 */
export async function executeCharmTransfer(params) {
  const {
    tokenAppId,
    inputUtxoId,
    inputTokenAmount,
    transferAmount,
    recipientAddress,
    senderAddress,
    senderAddressIndex,
    senderIsChange,
    seedPhrase,
    network,
    onStatus,
  } = params;

  const status = msg => { console.log('[CharmTransfer]', msg); onStatus?.(msg); };

  // 1. Build spell
  status('Building transfer spell…');
  const spell = buildTransferSpell({
    tokenAppId,
    inputUtxoId,
    inputTokenAmount,
    transferAmount,
    recipientAddress,
    senderAddress,
  });
  console.log('[CharmTransfer] Spell:', JSON.stringify(spell, null, 2));

  // 2. Normalize spell
  status('Normalizing spell…');
  const { normalizedSpellHex, appPrivateInputs, txInsBeamedSourceUtxos } = normalizeSpell(spell);

  // 3. Fetch prev_txs for all spell inputs
  status('Fetching input transactions…');
  const prevTxMap = await fetchPrevTxs(spell.ins, network);
  const prevTxs = spell.ins.map(inp => {
    const txid = inp.utxo_id.split(':')[0];
    const hex = prevTxMap.get(txid);
    if (!hex) throw new Error(`Missing tx hex for ${txid}`);
    return { bitcoin: hex };
  });

  // 4. Load token WASM
  status('Loading token contract…');
  const binaries = await getTokenBinaries(tokenAppId);

  // 5. Build prover payload
  const payload = {
    spell: normalizedSpellHex,
    app_private_inputs: appPrivateInputs,
    tx_ins_beamed_source_utxos: txInsBeamedSourceUtxos,
    binaries,
    prev_txs: prevTxs,
    change_address: senderAddress,
    fee_rate: 5,
    chain: 'bitcoin',
    collateral_utxo: null,
  };

  // 6. Send to prover (may take several minutes)
  status('Generating ZK proof (this can take 5–10 min)…');
  const spellTxHex = await proveTransfer(payload, network, status);
  status(`Prover returned TX (${spellTxHex.length / 2} bytes)`);

  // 7. Sign spell TX
  status('Signing transaction…');
  const signedTxHex = await signSpellTx(
    spellTxHex,
    prevTxMap,
    senderAddress,
    senderAddressIndex,
    senderIsChange,
    seedPhrase,
    network,
  );

  // 8. Broadcast
  status('Broadcasting transaction…');
  const txid = await broadcastTx(signedTxHex, network);
  status(`Broadcast OK — txid: ${txid}`);

  return { txid };
}
