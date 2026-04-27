/**
 * Transaction Classifier
 * Classifies Bitcoin transactions into different types based on their characteristics.
 * All detection is purely structural (inputs / outputs / amounts / addresses /
 * OP_RETURN presence) so a fresh wallet re-scan produces identical labels.
 */

// eBTC vault address (mainnet). Any tx that locks BTC into this address is
// the BTC leg of an eBTC mint; any tx that spends from it is a redeem.
const EBTC_VAULT_ADDR_MAINNET = 'bc1qrn970793udj0ugc3pj0hyrptts4rw5n7qxeya2';

// Dust used as the beam commitment output on Bitcoin (both placeholders and
// beam-in claim outputs use 546 sats).
const BEAM_DUST_SATS = 546;

// Transaction types
export const TRANSACTION_TYPES = {
    RECEIVED: 'received',           // Standard Bitcoin received
    SENT: 'sent',                   // Standard Bitcoin sent
    BRO_MINING: 'bro_mining',       // Bro token mining (333 or 777 sats + OP_RETURN at index 0)
    BRO_MINT: 'bro_mint',           // Bro token minting (1000 or 330 sats + change)
    CHARM_RECEIVED: 'charm_received', // Charm/token received from external address
    CHARM_SENT: 'charm_sent',       // Charm/token sent to external address
    CHARM_CONSOLIDATION: 'charm_consolidation', // Charm/token consolidation (2+ inputs)
    CHARM_SELF_TRANSFER: 'charm_self_transfer', // Charm/token self-transfer (internal)
    BEAM_IN: 'beam_in',             // Tokens claimed on Bitcoin from a Cardano beam
    BEAM_OUT: 'beam_out',           // Tokens sent from Bitcoin to Cardano
    BTC_PLACEHOLDER: 'btc_placeholder', // 546-sat self-paid dust placeholder for a beam
    EBTC_LOCK: 'ebtc_lock',         // BTC locked into the eBTC vault (mint+beam leg)
    EBTC_REDEEM: 'ebtc_redeem',     // BTC released from the eBTC vault to our wallet
};

// All tx types that carry charm data — used by the recorder to decide whether
// to call the charm extractor. Kept as a Set for O(1) lookup.
export const CHARM_TRANSACTION_TYPES = new Set([
    TRANSACTION_TYPES.CHARM_RECEIVED,
    TRANSACTION_TYPES.CHARM_SENT,
    TRANSACTION_TYPES.CHARM_CONSOLIDATION,
    TRANSACTION_TYPES.CHARM_SELF_TRANSFER,
    TRANSACTION_TYPES.BRO_MINT,
    TRANSACTION_TYPES.BRO_MINING,
    TRANSACTION_TYPES.BEAM_IN,
    TRANSACTION_TYPES.BEAM_OUT,
    TRANSACTION_TYPES.EBTC_LOCK,
    TRANSACTION_TYPES.EBTC_REDEEM,
]);

// Transaction labels for UI
export const TRANSACTION_LABELS = {
    [TRANSACTION_TYPES.RECEIVED]: 'Received Bitcoin',
    [TRANSACTION_TYPES.SENT]: 'Sent Bitcoin',
    [TRANSACTION_TYPES.BRO_MINING]: 'Bro Mining',
    [TRANSACTION_TYPES.BRO_MINT]: 'Bro Mint',
    [TRANSACTION_TYPES.CHARM_RECEIVED]: 'Received Charm Token',
    [TRANSACTION_TYPES.CHARM_SENT]: 'Sent Charm Token',
    [TRANSACTION_TYPES.CHARM_CONSOLIDATION]: 'Charm Consolidation',
    [TRANSACTION_TYPES.CHARM_SELF_TRANSFER]: 'Charm Self-Transfer',
    [TRANSACTION_TYPES.BEAM_IN]: 'Beam-in BRO (Cardano → Bitcoin)',
    [TRANSACTION_TYPES.BEAM_OUT]: 'Beam-out BRO (Bitcoin → Cardano)',
    [TRANSACTION_TYPES.BTC_PLACEHOLDER]: 'Beam placeholder (Bitcoin side)',
    [TRANSACTION_TYPES.EBTC_LOCK]: 'Beam-out eBTC (Bitcoin → Cardano)',
    [TRANSACTION_TYPES.EBTC_REDEEM]: 'eBTC Redeem',
};

function hasOpReturnAtIndex0(outputs) {
    if (!outputs || outputs.length === 0) return false;
    const firstOutput = outputs[0];
    return firstOutput.address === null || firstOutput.address === undefined;
}

/** Charms spell txs (v14) put the OP_RETURN at vout 2 or 3, not 0. Generic
 *  detector for any OP_RETURN output in the tx. */
function hasAnyOpReturn(outputs) {
    return (outputs || []).some(o => o.address === null || o.address === undefined);
}

function myAddressSet(myAddresses) {
    return new Set((myAddresses || []).map(a => a.address || a).filter(Boolean));
}

function hasVaultIn(inputs) {
    return (inputs || []).some(i => i.address === EBTC_VAULT_ADDR_MAINNET);
}

function hasVaultOut(outputs) {
    return (outputs || []).some(o => o.address === EBTC_VAULT_ADDR_MAINNET);
}

/** Charm-bearing input: any of the conventional charm dust amounts (v1 used
 *  330/1000 sats, v14 uses 546 sats). Used to detect "we're spending charms". */
function isCharmBearingAmount(amount) {
    return amount === 330 || amount === 1000 || amount === 546;
}

/** Detect whether the tx consumes a UTXO produced by a previously-classified
 *  BTC_PLACEHOLDER tx. That placeholder is the "claim ticket" for an ADA→BTC
 *  beam, so a spell tx spending it is the INBOUND claim (Beam-in). If no
 *  placeholder parent is referenced, the charm input is real BRO leaving for
 *  Cardano (Beam-out). Caller passes the set of known placeholder txids from
 *  wallet history. */
function consumesKnownPlaceholder(inputs, placeholderTxids) {
    if (!placeholderTxids || !placeholderTxids.size) return false;
    return (inputs || []).some(i => i.txid && placeholderTxids.has(i.txid));
}

/** Beam-in: spell tx claiming BRO that arrived from Cardano. Spends a prior
 *  BTC placeholder we created and mints a fresh charm output at our address. */
function isBeamIn(outputs, inputs, ownSet, placeholderTxids) {
    if (!hasAnyOpReturn(outputs)) return false;
    if (!consumesKnownPlaceholder(inputs, placeholderTxids)) return false;
    const ourCharmOuts = (outputs || []).filter(o =>
        isCharmBearingAmount(o.amount) && ownSet.has(o.address)
    );
    return ourCharmOuts.length > 0;
}

/** Beam-out: spell tx sending BRO from Bitcoin to Cardano. Spends a real
 *  charm UTXO (not a placeholder) and commits the tokens via the beam spell. */
function isBeamOut(outputs, inputs, ownSet, placeholderTxids) {
    if (!hasAnyOpReturn(outputs)) return false;
    const ourCharmIns = (inputs || []).filter(i =>
        isCharmBearingAmount(i.value) && ownSet.has(i.address)
    );
    if (ourCharmIns.length === 0) return false;
    // Rule out beam-in (placeholder spend)
    if (consumesKnownPlaceholder(inputs, placeholderTxids)) return false;
    // Rule out simple charm transfer to external address
    const hasExternalCharmOut = (outputs || []).some(o =>
        isCharmBearingAmount(o.amount) && o.address && !ownSet.has(o.address)
    );
    return !hasExternalCharmOut;
}

/** Placeholder (BTC side of an ADA→BTC beam): own input → 546 dust at own +
 *  change at own. No OP_RETURN. No charm tokens. Simple self-split. */
function isBtcPlaceholder(outputs, inputs, ownSet) {
    if (hasOpReturnAtIndex0(outputs)) return false;
    if (!outputs || outputs.length < 2) return false;
    const allOutsOwn = outputs.every(o => o.address && ownSet.has(o.address));
    if (!allOutsOwn) return false;
    const has546 = outputs.some(o => o.amount === BEAM_DUST_SATS);
    if (!has546) return false;
    const allInsOwn = (inputs || []).every(i => i.address && ownSet.has(i.address));
    if (!allInsOwn) return false;
    // Reject if any legacy charm amounts (330/1000 sats) — the 546 dust is
    // the placeholder amount itself, not a charm marker.
    const anyCharm = [...(inputs || []), ...(outputs || [])].some(u =>
        isLegacyCharmAmount(u.value ?? u.amount)
    );
    return !anyCharm;
}

/** Legacy charm dust amounts used before v14 (BRO mint/transfer convention). */
function isLegacyCharmAmount(amount) {
    return amount === 330 || amount === 1000;
}

/** Normalize sat amount from either input (`.value`) or output (`.amount`). */
function getSats(item) {
    return item?.value ?? item?.amount;
}

/** Split UTXOs (inputs or outputs) by ownership + charm-amount filter. */
function splitCharmByOwnership(utxos, ownSet, isCharm = isLegacyCharmAmount) {
    const internal = [];
    const external = [];
    for (const u of utxos || []) {
        if (!isCharm(getSats(u))) continue;
        if (u.address && ownSet.has(u.address)) internal.push(u);
        else if (u.address) external.push(u);
    }
    return { internal, external };
}

export function classifyTransaction(transaction, myAddresses = [], context = {}) {
    const { outputs, inputs } = transaction;
    const { placeholderTxids = null } = context;

    if (!outputs || outputs.length === 0) {
        return TRANSACTION_TYPES.RECEIVED;
    }

    const ownSet = myAddressSet(myAddresses);

    // eBTC vault has the highest priority — the vault address is a unique,
    // unambiguous marker for the BTC leg of eBTC flows.
    if (hasVaultIn(inputs)) return TRANSACTION_TYPES.EBTC_REDEEM;
    if (hasVaultOut(outputs)) return TRANSACTION_TYPES.EBTC_LOCK;

    // Beam patterns. The BEAM_IN vs BEAM_OUT distinction requires the caller
    // to pass `placeholderTxids` in context (set of known BTC_PLACEHOLDER
    // txids from history) — a spell tx consuming one of those is a claim.
    if (isBeamIn(outputs, inputs, ownSet, placeholderTxids)) return TRANSACTION_TYPES.BEAM_IN;
    if (isBeamOut(outputs, inputs, ownSet, placeholderTxids)) return TRANSACTION_TYPES.BEAM_OUT;

    if (isBtcPlaceholder(outputs, inputs, ownSet)) return TRANSACTION_TYPES.BTC_PLACEHOLDER;

    // BRO MINING: OP_RETURN at index 0 + 333 or 777 sats
    if (hasOpReturnAtIndex0(outputs)) {
        if (outputs.some(o => o.amount === 333 || o.amount === 777)) {
            return TRANSACTION_TYPES.BRO_MINING;
        }
    }

    // Legacy charm transfer classification (330/1000 sat marker).
    const charmIns = splitCharmByOwnership(inputs, ownSet);
    const charmOuts = splitCharmByOwnership(outputs, ownSet);

    // CHARM_RECEIVED: external charm input → our charm output (someone sent us tokens).
    if (charmIns.external.length > 0 && charmIns.internal.length === 0 && charmOuts.internal.length > 0) {
        return TRANSACTION_TYPES.CHARM_RECEIVED;
    }
    // CHARM_SENT: our charm input → external charm output (we sent tokens).
    if (charmIns.internal.length > 0 && charmOuts.external.length > 0) {
        return TRANSACTION_TYPES.CHARM_SENT;
    }
    // CHARM_CONSOLIDATION: 2+ own charm inputs only.
    if (charmIns.internal.length > 1 && charmIns.external.length === 0) {
        return TRANSACTION_TYPES.CHARM_CONSOLIDATION;
    }
    // CHARM_SELF_TRANSFER: 1 own charm input → own charm output.
    if (charmIns.internal.length === 1 && charmIns.external.length === 0 &&
        charmOuts.internal.length > 0 && charmOuts.external.length === 0) {
        return TRANSACTION_TYPES.CHARM_SELF_TRANSFER;
    }
    // BRO_MINT: no charm inputs, charm output at our address.
    if (charmIns.internal.length + charmIns.external.length === 0 && charmOuts.internal.length > 0) {
        return TRANSACTION_TYPES.BRO_MINT;
    }

    // Standard BTC direction.
    if (inputs?.some(i => i.address && ownSet.has(i.address))) return TRANSACTION_TYPES.SENT;
    return TRANSACTION_TYPES.RECEIVED;
}

/**
 * Get transaction label for UI display
 */
export function getTransactionLabel(transactionType) {
    return TRANSACTION_LABELS[transactionType] || TRANSACTION_LABELS[TRANSACTION_TYPES.RECEIVED];
}

/**
 * Extract the "semantic" amount for beam-related txs — the number the user
 * actually cares about, which is usually smaller than the net wallet delta.
 *
 *   EBTC_LOCK:      sats locked at the vault (the amount being tokenised)
 *   EBTC_REDEEM:    sats released from the vault back to us
 *   BEAM_OUT:       sats burned as the 546 dust commitment (placeholder ref)
 *   BEAM_IN:        sats received at our 546 dust charm output
 *   BTC_PLACEHOLDER: sats locked as the 546 placeholder
 *
 * Returns null if the type doesn't have a meaningful semantic amount.
 */
export function getSemanticAmountSats(transactionType, tx, myAddresses = []) {
    if (!tx) return null;
    const ownSet = myAddressSet(myAddresses);
    const outs = tx.outputs || [];
    const ins = tx.inputs || [];

    switch (transactionType) {
        case TRANSACTION_TYPES.EBTC_LOCK: {
            const vaultOut = outs.find(o => o.address === EBTC_VAULT_ADDR_MAINNET);
            return vaultOut?.amount ?? null;
        }
        case TRANSACTION_TYPES.EBTC_REDEEM: {
            // Sats released: sum of outputs to our own addresses that aren't the
            // new vault output (the vault-change output goes back to the vault).
            const ourOuts = outs.filter(o => o.address && ownSet.has(o.address));
            const total = ourOuts.reduce((s, o) => s + (o.amount || 0), 0);
            return total || null;
        }
        case TRANSACTION_TYPES.BEAM_OUT:
        case TRANSACTION_TYPES.BEAM_IN:
        case TRANSACTION_TYPES.BTC_PLACEHOLDER: {
            const dust = outs.find(o => o.amount === BEAM_DUST_SATS && ownSet.has(o.address));
            return dust?.amount ?? BEAM_DUST_SATS;
        }
        default:
            return null;
    }
}

/**
 * Get transaction icon/emoji for UI display
 */
export function getTransactionIcon(transactionType) {
    switch (transactionType) {
        case TRANSACTION_TYPES.RECEIVED:
            return '↙';
        case TRANSACTION_TYPES.SENT:
            return '↗';
        case TRANSACTION_TYPES.BRO_MINING:
            return '⛏️';
        case TRANSACTION_TYPES.BRO_MINT:
            return '🪙';
        case TRANSACTION_TYPES.CHARM_RECEIVED:
            return '↙';
        case TRANSACTION_TYPES.CHARM_SENT:
            return '↗';
        case TRANSACTION_TYPES.CHARM_CONSOLIDATION:
            return '↻';
        case TRANSACTION_TYPES.CHARM_SELF_TRANSFER:
            return '↻';
        case TRANSACTION_TYPES.BEAM_IN:
            return '↙';
        case TRANSACTION_TYPES.BEAM_OUT:
            return '↗';
        case TRANSACTION_TYPES.BTC_PLACEHOLDER:
            return '◇';
        case TRANSACTION_TYPES.EBTC_LOCK:
            return '🔒';
        case TRANSACTION_TYPES.EBTC_REDEEM:
            return '🔓';
        default:
            return '↙';
    }
}
