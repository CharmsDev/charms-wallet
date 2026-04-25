/**
 * Cardano funding UTXO selection and consolidation helpers.
 *
 * Beaming on Cardano needs:
 *   - Collateral UTXO (pure ADA, ≥2 ADA, separate)
 *   - Funding UTXO (pure ADA, large enough to cover claim/beam-out fees + min UTXO outputs)
 *
 * Tested minimum funding for various beam types:
 *   - Claim BTC→ADA:    ≥ 8 ADA pure (covers 2 ADA output + protocol fee + tx fee + change)
 *   - Beam-out ADA→BTC: ≥ 7 ADA pure (covers 2 ADA outputs × 2 + protocol fee + tx fee + change)
 *
 * If no single UTXO is large enough, callers can use `consolidateAdaUtxos()` to merge
 * multiple small UTXOs into one big funding UTXO BEFORE proving the beam.
 */

import { fetchUtxos, getProtocolParams, submitCardanoTx } from '@/services/cardano/api';
import { getSpentSet, syncWithChain } from '@/services/utxo-reservations';

/**
 * Fetch UTXOs and prune stale reservations based on fresh on-chain state.
 * Ensures we never block a selection on a UTXO that's already been consumed
 * (e.g., from a previous failed beam attempt that left a reservation behind).
 */
async function fetchUtxosAndSync(address, cardanoNet) {
  const utxos = await fetchUtxos(address, cardanoNet);
  const onChainKeys = new Set(utxos.map(u => `${u.txHash}:${u.outputIndex}`));
  syncWithChain('cardano', onChainKeys);
  return utxos;
}

/** Minimum lovelace for collateral. */
export const MIN_COLLATERAL_LOVELACE = 2_000_000n; // 2 ADA

/** Minimum lovelace for funding (covers protocol fee + outputs + tx fee + change). */
export const MIN_FUNDING_LOVELACE = 7_000_000n; // 7 ADA — comfortable margin

/**
 * Map beam-context BTC network → Cardano network used by providers.
 * Beam callers pass the Bitcoin network ('mainnet'|'testnet4'); the Cardano
 * provider expects 'mainnet'|'preprod'. If the caller already passes a
 * Cardano network, it passes through unchanged.
 */
function toCardanoNet(network) {
  if (!network) return undefined;
  if (network === 'mainnet') return 'mainnet';
  return 'preprod';
}

/**
 * Select a collateral UTXO (pure ADA, ≥2 ADA).
 *
 * @param {string} address
 * @param {Array<string>} [excludeUtxoIds] - "txHash:outputIndex" strings to exclude
 * @returns {Promise<{ txHash: string, outputIndex: number, lovelace: string, utxoId: string }>}
 */
export async function selectCardanoCollateral(address, excludeUtxoIds = [], network) {
  const utxos = await fetchUtxosAndSync(address, toCardanoNet(network));
  const reserved = getSpentSet('cardano');
  const exclude = new Set([...excludeUtxoIds, ...reserved]);

  const candidates = utxos
    .filter(u => !u.assets || u.assets.length === 0)
    .filter(u => !exclude.has(`${u.txHash}:${u.outputIndex}`))
    .filter(u => BigInt(u.lovelace || '0') >= MIN_COLLATERAL_LOVELACE)
    .sort((a, b) => Number(BigInt(a.lovelace) - BigInt(b.lovelace))); // smallest first

  if (!candidates.length) {
    throw new Error(
      `No suitable Cardano UTXO for collateral (need ≥ 2 ADA pure). Have ${utxos.length} UTXOs total.`
    );
  }

  const u = candidates[0];
  return {
    txHash: u.txHash,
    outputIndex: u.outputIndex,
    lovelace: u.lovelace,
    utxoId: `${u.txHash}:${u.outputIndex}`,
  };
}

/**
 * Select a funding UTXO (pure ADA, large enough for the beam tx).
 *
 * @param {string} address
 * @param {Array<string>} [excludeUtxoIds] - "txHash:outputIndex" strings to exclude
 * @param {bigint} [minLovelace] - Minimum required lovelace (default 7 ADA)
 * @returns {Promise<{ txHash: string, outputIndex: number, lovelace: string, utxoId: string } | null>}
 */
export async function selectCardanoFunding(address, excludeUtxoIds = [], minLovelace = MIN_FUNDING_LOVELACE, network) {
  const utxos = await fetchUtxosAndSync(address, toCardanoNet(network));
  const reserved = getSpentSet('cardano');
  const exclude = new Set([...excludeUtxoIds, ...reserved]);

  const candidates = utxos
    .filter(u => !u.assets || u.assets.length === 0)
    .filter(u => !exclude.has(`${u.txHash}:${u.outputIndex}`))
    .filter(u => BigInt(u.lovelace || '0') >= minLovelace)
    .sort((a, b) => Number(BigInt(b.lovelace) - BigInt(a.lovelace))); // largest first

  if (!candidates.length) return null;

  const u = candidates[0];
  return {
    txHash: u.txHash,
    outputIndex: u.outputIndex,
    lovelace: u.lovelace,
    utxoId: `${u.txHash}:${u.outputIndex}`,
  };
}

/**
 * Compute total pure-ADA balance available (excluding charm/CNT UTXOs).
 *
 * @param {string} address
 * @returns {Promise<bigint>}
 */
export async function getPureAdaBalance(address, network) {
  const utxos = await fetchUtxosAndSync(address, toCardanoNet(network));
  return utxos
    .filter(u => !u.assets || u.assets.length === 0)
    .reduce((sum, u) => sum + BigInt(u.lovelace || '0'), 0n);
}

/**
 * Check if the address has enough resources for a beam, and if not,
 * suggest consolidation.
 *
 * @param {string} address
 * @param {bigint} [minFunding] - Required funding lovelace
 * @returns {Promise<{ ok: boolean, totalAda: bigint, hasCollateral: boolean, hasFunding: boolean, needsConsolidation: boolean, message?: string }>}
 */
export async function checkCardanoBeamReadiness(address, minFunding = MIN_FUNDING_LOVELACE, network) {
  const utxos = await fetchUtxosAndSync(address, toCardanoNet(network));
  const pureAda = utxos.filter(u => !u.assets || u.assets.length === 0);
  const totalAda = pureAda.reduce((s, u) => s + BigInt(u.lovelace || '0'), 0n);

  const hasCollateral = pureAda.some(u => BigInt(u.lovelace) >= MIN_COLLATERAL_LOVELACE);
  const hasFunding = pureAda.some(u => BigInt(u.lovelace) >= minFunding);

  // Need both collateral AND funding (separate UTXOs)
  const required = MIN_COLLATERAL_LOVELACE + minFunding;
  const hasEnoughTotal = totalAda >= required;

  if (hasCollateral && hasFunding && pureAda.length >= 2) {
    return { ok: true, totalAda, hasCollateral, hasFunding, needsConsolidation: false };
  }

  if (!hasEnoughTotal) {
    return {
      ok: false,
      totalAda,
      hasCollateral,
      hasFunding,
      needsConsolidation: false,
      message: `Insufficient ADA. Have ${Number(totalAda) / 1e6} ADA, need at least ${Number(required) / 1e6} ADA (${Number(MIN_COLLATERAL_LOVELACE) / 1e6} collateral + ${Number(minFunding) / 1e6} funding).`,
    };
  }

  return {
    ok: false,
    totalAda,
    hasCollateral,
    hasFunding,
    needsConsolidation: true,
    message: `Have enough total ADA (${Number(totalAda) / 1e6}) but UTXOs are too fragmented. Consolidation needed to create one ${Number(minFunding) / 1e6}+ ADA UTXO.`,
  };
}

/**
 * Consolidate multiple pure-ADA UTXOs into one big UTXO at the same address.
 *
 * Used when fragmented UTXOs prevent a beam (no single UTXO is large enough for funding).
 * Skips UTXOs in `excludeUtxoIds` (e.g. the future placeholder/collateral).
 *
 * Returns the txHash of the consolidation tx (output 0 will be the new big UTXO).
 *
 * @param {object} params
 * @param {string} params.address - Bech32 Cardano address
 * @param {string} params.seedPhrase - Wallet seed for signing
 * @param {number} [params.addressIndex=0]
 * @param {Array<string>} [params.excludeUtxoIds]
 * @param {function} [params.onStatus]
 * @returns {Promise<{ txHash: string, consolidatedLovelace: string }>}
 */
/**
 * Split a single large pure-ADA UTXO into two outputs: a dedicated collateral
 * (~3 ADA) + the remainder. Used when a beam has enough ADA total but only
 * ONE pure-ADA UTXO is available (excluding placeholder), which prevents
 * collateral/funding selection (they must be separate UTXOs).
 *
 * @param {object} params
 * @param {string} params.address
 * @param {string} params.seedPhrase
 * @param {number} [params.addressIndex=0]
 * @param {Array<string>} [params.excludeUtxoIds] - UTXOs to not spend (e.g. placeholder)
 * @param {function} [params.onStatus]
 * @param {string} [params.network]
 * @returns {Promise<{ txHash: string }>}
 */
export async function splitForCollateral({
  address, seedPhrase, addressIndex = 0, excludeUtxoIds = [], onStatus, network,
}) {
  const cardanoNet = toCardanoNet(network);
  const { waitForCardanoWasm, getCardanoWasm } = await import('@/lib/cardano/cardanoWasm');
  await waitForCardanoWasm();
  const CSL = getCardanoWasm();
  const bip39 = await import('bip39');

  onStatus?.('Fetching Cardano UTXOs to split...');
  const utxos = await fetchUtxosAndSync(address, cardanoNet);

  const reserved = getSpentSet('cardano');
  const exclude = new Set([...excludeUtxoIds, ...reserved]);

  const candidates = utxos
    .filter(u => !u.assets || u.assets.length === 0)
    .filter(u => !exclude.has(`${u.txHash}:${u.outputIndex}`))
    .sort((a, b) => Number(BigInt(b.lovelace) - BigInt(a.lovelace))); // largest first

  if (!candidates.length) {
    throw new Error('No pure ADA UTXO available to split.');
  }

  const target = candidates[0];
  const targetLovelace = BigInt(target.lovelace);
  const collateralLovelace = 3_000_000n; // 3 ADA (safely above min)

  if (targetLovelace < collateralLovelace + MIN_FUNDING_LOVELACE) {
    throw new Error(
      `UTXO too small to split. Have ${Number(targetLovelace) / 1e6} ADA, ` +
      `need ≥ ${Number(collateralLovelace + MIN_FUNDING_LOVELACE) / 1e6} ADA.`
    );
  }

  onStatus?.(`Splitting ${Number(targetLovelace) / 1e6} ADA UTXO into collateral + funding...`);

  const rootKey = CSL.Bip32PrivateKey.from_bip39_entropy(
    Buffer.from(bip39.mnemonicToEntropy(seedPhrase), 'hex'),
    Buffer.alloc(0)
  );
  const paymentKey = rootKey.derive(2147485500).derive(2147485463).derive(2147483648).derive(0).derive(addressIndex);

  const params = await getProtocolParams(cardanoNet);

  const txBuilder = CSL.TransactionBuilder.new(
    CSL.TransactionBuilderConfigBuilder.new()
      .fee_algo(CSL.LinearFee.new(
        CSL.BigNum.from_str(String(params.min_fee_a || '44')),
        CSL.BigNum.from_str(String(params.min_fee_b || '155381'))
      ))
      .pool_deposit(CSL.BigNum.from_str(String(params.pool_deposit || '500000000')))
      .key_deposit(CSL.BigNum.from_str(String(params.key_deposit || '2000000')))
      .coins_per_utxo_byte(CSL.BigNum.from_str(String(params.coins_per_utxo_size || '4310')))
      .max_tx_size(parseInt(params.max_tx_size) || 16384)
      .max_value_size(parseInt(params.max_val_size) || 5000)
      .build()
  );

  const destAddr = CSL.Address.from_bech32(address);

  txBuilder.add_regular_input(
    destAddr,
    CSL.TransactionInput.new(CSL.TransactionHash.from_hex(target.txHash), target.outputIndex),
    CSL.Value.new(CSL.BigNum.from_str(targetLovelace.toString()))
  );

  // Output 1: collateral (3 ADA)
  txBuilder.add_output(
    CSL.TransactionOutput.new(destAddr, CSL.Value.new(CSL.BigNum.from_str(collateralLovelace.toString())))
  );

  // Output 2: rest (via change_if_needed) — will be the funding UTXO
  txBuilder.add_change_if_needed(destAddr);

  const txBody = txBuilder.build();
  const unsignedTx = CSL.Transaction.new(txBody, CSL.TransactionWitnessSet.new());
  const fixedTx = CSL.FixedTransaction.from_bytes(unsignedTx.to_bytes());
  fixedTx.sign_and_add_vkey_signature(paymentKey.to_raw_key());

  onStatus?.('Submitting split tx...');
  const txHash = fixedTx.transaction_hash().to_hex();
  await submitCardanoTx(fixedTx.to_bytes(), cardanoNet);

  return { txHash };
}

export async function consolidateAdaUtxos({
  address, seedPhrase, addressIndex = 0, excludeUtxoIds = [], onStatus, network,
}) {
  const cardanoNet = toCardanoNet(network);
  const { waitForCardanoWasm, getCardanoWasm } = await import('@/lib/cardano/cardanoWasm');
  await waitForCardanoWasm();
  const CSL = getCardanoWasm();
  const bip39 = await import('bip39');

  const exclude = new Set(excludeUtxoIds);

  onStatus?.('Fetching Cardano UTXOs to consolidate...');
  const utxos = await fetchUtxosAndSync(address, cardanoNet);

  // Pick all pure-ADA UTXOs not in exclude list
  const pureAda = utxos
    .filter(u => !u.assets || u.assets.length === 0)
    .filter(u => !exclude.has(`${u.txHash}:${u.outputIndex}`));

  if (pureAda.length < 2) {
    throw new Error(`Nothing to consolidate (have ${pureAda.length} pure ADA UTXO).`);
  }

  const totalLovelace = pureAda.reduce((s, u) => s + BigInt(u.lovelace || '0'), 0n);
  onStatus?.(`Consolidating ${pureAda.length} UTXOs (${Number(totalLovelace) / 1e6} ADA)...`);

  // Derive payment key
  const rootKey = CSL.Bip32PrivateKey.from_bip39_entropy(
    Buffer.from(bip39.mnemonicToEntropy(seedPhrase), 'hex'),
    Buffer.alloc(0)
  );
  const paymentKey = rootKey.derive(2147485500).derive(2147485463).derive(2147483648).derive(0).derive(addressIndex);

  // Fetch protocol params
  const params = await getProtocolParams(cardanoNet);

  const txBuilder = CSL.TransactionBuilder.new(
    CSL.TransactionBuilderConfigBuilder.new()
      .fee_algo(CSL.LinearFee.new(
        CSL.BigNum.from_str(String(params.min_fee_a || '44')),
        CSL.BigNum.from_str(String(params.min_fee_b || '155381'))
      ))
      .pool_deposit(CSL.BigNum.from_str(String(params.pool_deposit || '500000000')))
      .key_deposit(CSL.BigNum.from_str(String(params.key_deposit || '2000000')))
      .coins_per_utxo_byte(CSL.BigNum.from_str(String(params.coins_per_utxo_size || '4310')))
      .max_tx_size(parseInt(params.max_tx_size) || 16384)
      .max_value_size(parseInt(params.max_val_size) || 5000)
      .build()
  );

  const destAddr = CSL.Address.from_bech32(address);

  for (const u of pureAda) {
    txBuilder.add_regular_input(
      destAddr,
      CSL.TransactionInput.new(CSL.TransactionHash.from_hex(u.txHash), u.outputIndex),
      CSL.Value.new(CSL.BigNum.from_str(u.lovelace))
    );
  }

  // add_change_if_needed will create one big output back to ourselves
  txBuilder.add_change_if_needed(destAddr);

  const txBody = txBuilder.build();
  const unsignedTx = CSL.Transaction.new(txBody, CSL.TransactionWitnessSet.new());
  const fixedTx = CSL.FixedTransaction.from_bytes(unsignedTx.to_bytes());
  fixedTx.sign_and_add_vkey_signature(paymentKey.to_raw_key());

  onStatus?.('Submitting consolidation tx...');
  const txHash = fixedTx.transaction_hash().to_hex();
  await submitCardanoTx(fixedTx.to_bytes(), cardanoNet);

  return { txHash, consolidatedLovelace: totalLovelace.toString() };
}

/**
 * Unified preparation step before any Cardano beam tx that needs both a
 * collateral and a funding UTXO.
 *
 * Pipeline:
 *   1. Check readiness via `checkCardanoBeamReadiness`.
 *   2. If `needsConsolidation` → run `consolidateAdaUtxos`, wait, re-check.
 *   3. If `enableSplit` and we still don't have 2 viable UTXOs (≥2 ADA each,
 *      with the largest ≥7 ADA) → run `splitForCollateral` and poll until the
 *      split outputs appear on-chain.
 *   4. Select collateral + funding (separate UTXOs) and return both.
 *
 * Replaces the per-executor inline logic that had drifted: each callsite was
 * implementing a slightly different version of this — including one (eBTC
 * redeem) that skipped consolidation entirely and threw on fragmented wallets.
 *
 * @param {object} params
 * @param {string} params.address          Bech32 Cardano address paying fees + signing
 * @param {string} params.seedPhrase
 * @param {number} [params.addressIndex=0]
 * @param {Array<string>} [params.excludeUtxoIds]  UTXOs never to spend (e.g. CNT being beamed, placeholder)
 * @param {string} params.network          'mainnet' | 'testnet4' | 'preprod'
 * @param {function} [params.onStatus]
 * @param {boolean} [params.enableSplit=false]   Auto-split a single big UTXO into collateral+funding when needed
 * @param {number} [params.consolidateWaitMs=8000]
 * @param {number} [params.splitWaitMaxMs=180000]
 * @param {number} [params.splitPollMs=15000]
 * @returns {Promise<{
 *   collateral: { txHash: string, outputIndex: number, lovelace: string, utxoId: string },
 *   funding:    { txHash: string, outputIndex: number, lovelace: string, utxoId: string },
 *   collateralUtxoId: string,
 *   fundingUtxoId: string,
 * }>}
 */
export async function prepareCollateralAndFunding({
  address, seedPhrase, addressIndex = 0, excludeUtxoIds = [],
  network, onStatus,
  enableSplit = false,
  consolidateWaitMs = 8000,
  splitWaitMaxMs = 3 * 60 * 1000,
  splitPollMs = 15_000,
}) {
  // Step 1: Readiness check — also gives us a proper error message if the
  // user just doesn't have enough ADA for any beam (vs fragmented).
  let readiness = await checkCardanoBeamReadiness(address, undefined, network);

  // Step 2: Auto-consolidate if fragmented.
  if (!readiness.ok && readiness.needsConsolidation) {
    onStatus?.('Consolidating ADA UTXOs (one-time setup)...');
    const consolidation = await consolidateAdaUtxos({
      address, seedPhrase, addressIndex, excludeUtxoIds, onStatus, network,
    });
    onStatus?.(`Consolidation tx ${consolidation.txHash.slice(0, 16)}... waiting...`);
    await new Promise(r => setTimeout(r, consolidateWaitMs));
    readiness = await checkCardanoBeamReadiness(address, undefined, network);
  }

  if (!readiness.ok) {
    throw new Error(readiness.message || 'Cardano not ready for beam');
  }

  // Step 3: Optional split — only used when callers expect to consume an
  // existing UTXO that leaves the wallet with too few separate UTXOs for
  // collateral + funding (e.g. immediately after a beam-in claim).
  if (enableSplit) {
    const cardanoNet = toCardanoNet(network);
    const allUtxos = await fetchUtxos(address, cardanoNet);
    const excludeSet = new Set(excludeUtxoIds);
    const viable = allUtxos
      .filter(u => !u.assets || u.assets.length === 0)
      .filter(u => !excludeSet.has(`${u.txHash}:${u.outputIndex}`))
      .filter(u => BigInt(u.lovelace || '0') >= MIN_COLLATERAL_LOVELACE)
      .sort((a, b) => Number(BigInt(b.lovelace) - BigInt(a.lovelace)));

    const canFund = viable.length >= 2
      && BigInt(viable[0].lovelace) >= MIN_FUNDING_LOVELACE
      && BigInt(viable[1].lovelace) >= MIN_COLLATERAL_LOVELACE;

    if (!canFund) {
      onStatus?.('Splitting UTXO into collateral + funding...');
      const split = await splitForCollateral({
        address, seedPhrase, addressIndex, excludeUtxoIds, onStatus, network,
      });
      onStatus?.(`Split tx ${split.txHash.slice(0, 16)}... waiting for confirmation`);

      const deadline = Date.now() + splitWaitMaxMs;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, splitPollMs));
        const latest = await fetchUtxos(address, cardanoNet);
        const latestViable = latest
          .filter(u => !u.assets || u.assets.length === 0)
          .filter(u => !excludeSet.has(`${u.txHash}:${u.outputIndex}`))
          .filter(u => BigInt(u.lovelace || '0') >= MIN_COLLATERAL_LOVELACE);
        const hasSplitOutputs = latest.some(u => u.txHash === split.txHash);
        if (latestViable.length >= 2 && hasSplitOutputs) break;
      }
    }
  }

  // Step 4: Select collateral + funding (must be separate UTXOs).
  onStatus?.('Selecting Cardano collateral and funding...');
  const collateral = await selectCardanoCollateral(address, excludeUtxoIds, network);
  const funding = await selectCardanoFunding(
    address, [...excludeUtxoIds, collateral.utxoId], undefined, network,
  );

  if (!funding) {
    const totalAdaNum = Number(readiness.totalAda) / 1e6;
    const collateralAdaNum = Number(BigInt(collateral.lovelace)) / 1e6;
    throw new Error(
      `No pure ADA UTXO ≥${Number(MIN_FUNDING_LOVELACE) / 1e6} ADA available for funding. ` +
      `Total: ${totalAdaNum.toFixed(2)} ADA, ` +
      `collateral ate ${collateralAdaNum.toFixed(2)} ADA, ` +
      `rest may still be fragmented. Retry or send more ADA.`
    );
  }

  return {
    collateral,
    funding,
    collateralUtxoId: collateral.utxoId,
    fundingUtxoId: funding.utxoId,
  };
}
