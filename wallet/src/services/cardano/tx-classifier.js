/**
 * Cardano transaction classifier.
 *
 * Given a Koios `tx_info` response and the wallet's own address, infers the
 * semantic type of the transaction so the history view can show meaningful
 * labels instead of raw hashes.
 *
 * Koios `tx_info` shape used:
 * {
 *   tx_hash, block_height, tx_timestamp, fee,
 *   inputs:  [{ payment_addr: { bech32 }, value, asset_list: [{ policy_id, asset_name, quantity }] }],
 *   outputs: [{ payment_addr: { bech32 }, value, asset_list: [{ policy_id, asset_name, quantity }] }],
 * }
 */

// Known CNT proxy policy IDs (mainnet). Keep in sync with the dialogs.
const KNOWN_TOKENS = {
  'b8f72e95dee612df98ac5a90b7604f7815c2af07a6db209a5c70abe4': {
    ticker: 'BRO',
    decimals: 8,
    // CIP-67 label 0x0014df10 is the fungible token prefix — this is the
    // asset_name hex prefix for 333 tokens
    tokenLabelHex: '0014df10',
  },
  '552b22f4989ea698fabbf6314b70d2e5edb49c1fdbdeb6096e8c84b6': {
    ticker: 'eBTC',
    decimals: 8,
    tokenLabelHex: '0014df10',
  },
};

export const CARDANO_TX_TYPE = {
  BEAM_IN: 'beam_in',                // Tokens minted here via claim (Bitcoin → Cardano)
  BEAM_OUT: 'beam_out',              // Tokens left Cardano for Bitcoin (no external CNT output)
  CNT_SENT: 'cnt_sent',              // Tokens transferred to another Cardano wallet
  CNT_RECEIVED: 'cnt_received',      // Tokens received from another Cardano wallet (no mint)
  PLACEHOLDER: 'placeholder',        // Placeholder UTXO created for a beam
  CONSOLIDATION: 'consolidation',    // Own → own, ADA-only, merging UTXOs
  SELF_TRANSFER: 'self_transfer',    // Own → own, no token movement
  SENT: 'sent',                      // ADA leaves the wallet
  RECEIVED: 'received',              // ADA enters the wallet
  UNKNOWN: 'unknown',
};

/** Sum token quantities per `policyId+assetName` across a list of UTXOs. */
function sumTokens(utxos) {
  const totals = new Map();
  for (const u of utxos || []) {
    for (const a of u.asset_list || []) {
      const key = `${a.policy_id}.${a.asset_name || ''}`;
      const prev = totals.get(key) || { policy_id: a.policy_id, asset_name: a.asset_name, quantity: 0n };
      totals.set(key, { ...prev, quantity: prev.quantity + BigInt(a.quantity || '0') });
    }
  }
  return totals;
}

function sumLovelace(utxos) {
  return (utxos || []).reduce((s, u) => s + BigInt(u.value || '0'), 0n);
}

function filterByAddress(utxos, ownAddresses) {
  const set = new Set(ownAddresses);
  const own = [];
  const ext = [];
  for (const u of utxos || []) {
    const addr = u.payment_addr?.bech32;
    if (addr && set.has(addr)) own.push(u); else ext.push(u);
  }
  return { own, ext };
}

/**
 * Detect known-token mints in a Koios tx_info.assets_minted field.
 * Returns an array of { policy_id, asset_name, ticker, decimals, quantity }
 * for policies we recognize (BRO, eBTC). Positive quantity == mint; negative
 * == burn. Beam-in claims have mints for the token policy.
 */
function detectMintedTokens(assetsMinted) {
  const results = [];
  for (const a of (assetsMinted || [])) {
    const meta = KNOWN_TOKENS[a.policy_id];
    if (!meta) continue;
    const q = BigInt(a.quantity || '0');
    if (q === 0n) continue;
    results.push({
      policy_id: a.policy_id,
      asset_name: a.asset_name || '',
      ticker: meta.ticker,
      decimals: meta.decimals,
      quantity: q,
    });
  }
  return results;
}

/**
 * Detect charm tokens leaving our wallet to EXTERNAL Cardano addresses.
 * Useful when we beam-out eBTC/BRO to another user's Cardano address: the
 * own→own delta is 0 but charm net flow (our ins) - (external outs) > 0.
 * Returns list of { ticker, delta, policy_id, asset_name }, where `delta`
 * is POSITIVE when the token left us (so the caller negates it for display).
 */
function detectExternalCharmMovement(ownInputs, extOutputs) {
  const ownIn = sumTokens(ownInputs);
  const extOut = sumTokens(extOutputs);
  const results = [];
  for (const [k, entry] of ownIn) {
    const meta = KNOWN_TOKENS[entry.policy_id];
    if (!meta) continue;
    const extQ = extOut.get(k)?.quantity || 0n;
    if (extQ > 0n && entry.quantity > 0n) {
      // Token that WAS in our inputs appears at external outputs → left us.
      results.push({
        policy_id: entry.policy_id,
        asset_name: entry.asset_name,
        ticker: meta.ticker,
        decimals: meta.decimals,
        delta: -extQ, // negative because it left us
      });
    }
  }
  return results;
}

/**
 * Identify any known charm tokens present in the diff (delta) between output
 * and input totals for the wallet.
 */
function detectCharmDelta(ownInputs, ownOutputs) {
  const ins = sumTokens(ownInputs);
  const outs = sumTokens(ownOutputs);
  const keys = new Set([...ins.keys(), ...outs.keys()]);
  const changes = [];
  for (const k of keys) {
    const meta = KNOWN_TOKENS[k.split('.')[0]];
    if (!meta) continue;
    const inQ = ins.get(k)?.quantity || 0n;
    const outQ = outs.get(k)?.quantity || 0n;
    if (inQ === outQ) continue;
    changes.push({
      policy_id: k.split('.')[0],
      asset_name: k.split('.')[1] || '',
      ticker: meta.ticker,
      decimals: meta.decimals,
      delta: outQ - inQ, // positive = we received, negative = we sent
    });
  }
  return changes;
}

/**
 * Classify a tx. Returns { type, label, token?, amount?, direction? }.
 */
export function classifyCardanoTx(detail, ownAddresses) {
  if (!detail) return { type: CARDANO_TX_TYPE.UNKNOWN, label: 'Transaction' };

  const { own: ownIns, ext: extIns } = filterByAddress(detail.inputs, ownAddresses);
  const { own: ownOuts, ext: extOuts } = filterByAddress(detail.outputs, ownAddresses);

  const ownInLovelace = sumLovelace(ownIns);
  const ownOutLovelace = sumLovelace(ownOuts);

  // Charm deltas — we need to inspect both own (ins→outs at our addresses)
  // and external movements (ours→external, external→ours) to distinguish:
  //   - Beam-in  (mint): tokens appear at us, came from a mint/claim event
  //   - Beam-out (to BTC): our CNT consumed, NO external Cardano address gets it
  //   - Sent CNT (to other Cardano wallet): our CNT consumed, external gets it
  //   - Received CNT (from other Cardano wallet): CNT arrived from external input
  const ownCharmDelta = detectCharmDelta(ownIns, ownOuts);
  const outToExternal = detectExternalCharmMovement(ownIns, extOuts);
  const inFromExternal = detectExternalCharmMovement(extIns, ownOuts);
  // Koios tx_info includes `assets_minted` when a tx mints/burns tokens.
  // A positive mint for a known token policy == beam-in (claim from Bitcoin).
  const mintedTokens = detectMintedTokens(detail.assets_minted);

  // 1. Beam-in (claim): a known-token mint occurred AND we received it.
  if (mintedTokens.length > 0 && ownCharmDelta.some(c => c.delta > 0n)) {
    const token = ownCharmDelta.find(c => c.delta > 0n);
    return {
      type: CARDANO_TX_TYPE.BEAM_IN,
      label: `Beam-in ${token.ticker} (Bitcoin → Cardano)`,
      token,
      amount: token.delta,
      direction: 'in',
    };
  }

  // 2. Beam-out (to Bitcoin): our CNT consumed, NOT sent to another Cardano
  // wallet, and no own charm output received it back. The tokens effectively
  // left Cardano via the beam_to commitment.
  if (ownCharmDelta.some(c => c.delta < 0n) && outToExternal.length === 0) {
    const token = ownCharmDelta.find(c => c.delta < 0n);
    return {
      type: CARDANO_TX_TYPE.BEAM_OUT,
      label: `Beam-out ${token.ticker} (Cardano → Bitcoin)`,
      token,
      amount: -token.delta,
      direction: 'out',
    };
  }

  // 3. CNT sent to another Cardano wallet: our CNT consumed AND an external
  // Cardano address received the same CNT.
  if (outToExternal.length > 0) {
    const token = outToExternal[0];
    return {
      type: CARDANO_TX_TYPE.CNT_SENT,
      label: `Sent ${token.ticker} (Cardano)`,
      token,
      amount: -token.delta,
      direction: 'out',
    };
  }

  // 4. CNT received from another Cardano wallet: CNT arrived from external
  // input, no mint event involved.
  if (inFromExternal.length > 0 && mintedTokens.length === 0) {
    const token = inFromExternal[0];
    return {
      type: CARDANO_TX_TYPE.CNT_RECEIVED,
      label: `Received ${token.ticker} (Cardano)`,
      token,
      amount: -token.delta, // detectExternalCharmMovement returns negative for ins→us
      direction: 'in',
    };
  }

  // 5. Own-only, no token movement — classify purely by input/output shape.
  // Labels reflect only what's observable on-chain (origin = destination is us).
  const isOwnOnly = extIns.length === 0 && extOuts.length === 0;
  const hasNoTokens = ownCharmDelta.length === 0 && outToExternal.length === 0 && inFromExternal.length === 0;
  if (isOwnOnly && hasNoTokens) {
    // Many inputs → one output = consolidation
    if (ownIns.length >= 2 && ownOuts.length === 1) {
      return {
        type: CARDANO_TX_TYPE.CONSOLIDATION,
        label: 'UTXO consolidation',
        amount: ownOutLovelace,
      };
    }
    // One input → many outputs = split
    if (ownIns.length === 1 && ownOuts.length >= 2) {
      return {
        type: CARDANO_TX_TYPE.SELF_TRANSFER,
        label: 'UTXO split',
        amount: ownOutLovelace,
      };
    }
    return {
      type: CARDANO_TX_TYPE.SELF_TRANSFER,
      label: 'Self-transfer',
      amount: ownOutLovelace,
    };
  }

  // 6. Sent — own inputs, external gets the ADA.
  if (ownIns.length > 0 && extOuts.length > 0 && ownOutLovelace < ownInLovelace) {
    return {
      type: CARDANO_TX_TYPE.SENT,
      label: 'Sent ADA',
      amount: ownInLovelace - ownOutLovelace - BigInt(detail.fee || '0'),
      direction: 'out',
    };
  }

  // 7. Received — external inputs, we got ADA (no charms).
  if (extIns.length > 0 && ownOuts.length > 0 && ownOutLovelace > 0n) {
    return {
      type: CARDANO_TX_TYPE.RECEIVED,
      label: 'Received ADA',
      amount: ownOutLovelace,
      direction: 'in',
    };
  }

  return { type: CARDANO_TX_TYPE.UNKNOWN, label: 'Transaction' };
}

export const CARDANO_TX_ICON = {
  [CARDANO_TX_TYPE.BEAM_IN]: '↙',
  [CARDANO_TX_TYPE.BEAM_OUT]: '↗',
  [CARDANO_TX_TYPE.CNT_SENT]: '↗',
  [CARDANO_TX_TYPE.CNT_RECEIVED]: '↙',
  [CARDANO_TX_TYPE.PLACEHOLDER]: '◇',
  [CARDANO_TX_TYPE.CONSOLIDATION]: '↻',
  [CARDANO_TX_TYPE.SELF_TRANSFER]: '↻',
  [CARDANO_TX_TYPE.SENT]: '↗',
  [CARDANO_TX_TYPE.RECEIVED]: '↙',
  [CARDANO_TX_TYPE.UNKNOWN]: 'TX',
};
