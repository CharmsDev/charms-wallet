/**
 * Known Bitcoin addresses used by Charms infra.
 *
 * The wallet labels outputs in the tx detail view by checking the
 * destination against this map — turns raw "0.00002 BTC → bc1qxxxjm..."
 * lines into "0.00002 BTC → Scrolls fee".
 *
 * Addresses sourced from:
 *   - scrolls/src/scrolls_bitcoin/config.yaml (fee_address)
 *   - eBTC vault (hardcoded constant in beam executor)
 *   - Vault addresses are derived per nonce by Scrolls; we recognise the
 *     known eBTC vault explicitly. New vaults discovered on chain show as
 *     "External" until added here.
 */

export const KNOWN_ADDRESSES = {
    // ── Scrolls fee receivers (operator pays the Succinct prover from this) ──
    'bc1qxxxjm06n50uugxewxe5r5w5tskqwq4gkwrm0al': {
        label: 'Scrolls fee',
        kind: 'scrolls_fee',
        description: 'Network fee — Scrolls signers + Succinct prover',
        color: 'purple',
    },
    'tb1qrk6da5g0592sx6lmgpchaf5qy2lgn8am7cuf3a': {
        label: 'Scrolls fee',
        kind: 'scrolls_fee',
        description: 'Network fee (testnet4)',
        color: 'purple',
    },
    // ── eBTC vault ───────────────────────────────────────────────────────
    'bc1qrn970793udj0ugc3pj0hyrptts4rw5n7qxeya2': {
        label: 'eBTC Vault',
        kind: 'vault_ebtc',
        description: 'BTC locked behind the eBTC contract',
        color: 'orange',
    },
};

/**
 * Classify an output for UI display.
 *
 * Returns: { label, kind, color, description }
 *   - kind: 'scrolls_fee' | 'vault_ebtc' | 'op_return' | 'self' | 'external'
 *   - color: tailwind hint ('orange' | 'purple' | 'green' | 'gray' | 'blue')
 */
export function classifyOutput(output, ownAddressSet = new Set()) {
    if (!output) return { label: 'Unknown', kind: 'unknown', color: 'gray', description: null };

    if (output.isOpReturn) {
        return {
            label: 'OP_RETURN',
            kind: 'op_return',
            color: 'gray',
            description: 'Spell commitment — no monetary value',
        };
    }

    if (output.address && KNOWN_ADDRESSES[output.address]) {
        return KNOWN_ADDRESSES[output.address];
    }

    if (output.address && ownAddressSet.has(output.address)) {
        return {
            label: 'Your wallet',
            kind: 'self',
            color: 'green',
            description: null,
        };
    }

    if (output.address) {
        return {
            label: 'External',
            kind: 'external',
            color: 'blue',
            description: null,
        };
    }

    return { label: 'Unknown', kind: 'unknown', color: 'gray', description: null };
}

/**
 * Same logic for inputs (which have prevout addresses resolved by the
 * decoded-tx helper).
 */
export function classifyInput(input, ownAddressSet = new Set()) {
    if (!input || !input.address) {
        return { label: 'Unknown', kind: 'unknown', color: 'gray', description: null };
    }
    if (KNOWN_ADDRESSES[input.address]) return KNOWN_ADDRESSES[input.address];
    if (ownAddressSet.has(input.address)) {
        return { label: 'Your wallet', kind: 'self', color: 'green', description: null };
    }
    return { label: 'External', kind: 'external', color: 'blue', description: null };
}
